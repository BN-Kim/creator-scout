import pLimit from "p-limit";
import {
  createUncheckedRecruitmentEvidence,
  normalizeApprovedRecruitmentEvidence,
} from "@/server/providers/recruitment/approved-public-provider";
import { evaluateKoreanLanguageActivity } from "@/server/providers/recruitment/korean-language-activity";
import type { LiveRecruitmentProviderConfig } from "@/server/providers/recruitment/live-provider-config";
import type {
  OfficialSiteCollection,
  OfficialSiteCollector,
  PublicPageStopReason,
  SafeRecruitmentRawSummary,
  YouTubeRecruitmentSourceClient,
} from "@/server/providers/recruitment/live-source-types";
import type { RecruitmentEvidenceProvider } from "@/server/providers/recruitment/provider-contract";
import type {
  RawPublicContactEvidence,
  RawRecruitmentEvidenceItem,
  RecruitmentEvidenceRequest,
  RecruitmentEvidenceResult,
} from "@/server/providers/recruitment/provider-types";
import { PublicOfficialSiteClient } from "@/server/providers/recruitment/public-web-client";
import { classifyVisibleRecruitmentEvidence } from "@/server/providers/recruitment/visible-email-classifier";
import { extractSafeDiscoveryPhrases } from "@/server/discovery/learned-phrase-extractor";
import { loadYouTubeProviderConfig } from "@/server/providers/youtube/provider-config";
import { YouTubeProviderError } from "@/server/providers/youtube/provider-error";
import { YouTubeDataApiRecruitmentClient } from "@/server/providers/recruitment/youtube-data-api-recruitment-client";

export type LiveRecruitmentProviderErrorCategory = "invalid_input" | "provider_incompatible";

export class LiveRecruitmentProviderError extends Error {
  constructor(readonly category: LiveRecruitmentProviderErrorCategory) {
    super("라이브 리크루팅 근거 공급자 처리에 실패했습니다.");
    this.name = "LiveRecruitmentProviderError";
  }
}

export interface LiveRecruitmentProviderDependencies {
  youtubeClientFactory?: () => Promise<YouTubeRecruitmentSourceClient>;
  officialSiteCollector?: OfficialSiteCollector;
  now?: () => Date;
}

export interface LiveRecruitmentRawResult {
  items: RawRecruitmentEvidenceItem[];
  summary: SafeRecruitmentRawSummary;
}

export class LiveRecruitmentEvidenceProvider implements RecruitmentEvidenceProvider {
  private readonly youtubeClientFactory: () => Promise<YouTubeRecruitmentSourceClient>;
  private readonly officialSiteCollector: OfficialSiteCollector;
  private readonly now: () => Date;
  private youtubeClientPromise: Promise<YouTubeRecruitmentSourceClient> | null = null;

  constructor(
    private readonly config: LiveRecruitmentProviderConfig,
    dependencies: LiveRecruitmentProviderDependencies = {},
  ) {
    this.youtubeClientFactory = dependencies.youtubeClientFactory ?? createRuntimeYouTubeClient;
    this.officialSiteCollector = dependencies.officialSiteCollector ?? new PublicOfficialSiteClient(config);
    this.now = dependencies.now ?? (() => new Date());
  }

  async collectEvidence(request: RecruitmentEvidenceRequest): Promise<RecruitmentEvidenceResult<LiveRecruitmentRawResult>> {
    validateRequest(request);
    const checkedAt = this.now().toISOString();
    let snapshot;
    try {
      snapshot = await withTimeout(
        this.getYouTubeClient().then((client) => client.collectPublicRecruitmentSurface(request.channelId, this.config.recentVideoLimit)),
        this.config.requestTimeoutMs,
      );
    } catch (error: unknown) {
      if (isExpectedUnavailable(error)) return unavailableResult(request, checkedAt, unavailableReason(error));
      throw new LiveRecruitmentProviderError("provider_incompatible");
    }
    if (snapshot.channelId !== request.channelId) throw new LiveRecruitmentProviderError("provider_incompatible");

    const siteLimit = pLimit(this.config.maxConcurrency);
    const officialLinks = [...new Set(snapshot.officialLinks)].slice(0, this.config.maxOfficialSites);
    const officialSites = await Promise.all(officialLinks.map((url) => siteLimit(async () => {
      try {
        return await this.officialSiteCollector.collect(url);
      } catch {
        return {
          requestedUrl: url,
          registrableDomain: null,
          pages: [],
          stopReasons: ["temporary_failure" as const],
        };
      }
    })));
    const classified = classifyVisibleRecruitmentEvidence({
      snapshot,
      officialSites,
      consumerDomains: this.config.consumerDomains,
      checkedAt,
    });
    const unavailableContacts = officialSites.flatMap((site) => unavailableSiteObservations(site, checkedAt));
    const items: RawRecruitmentEvidenceItem[] = [
      ...classified.contacts,
      ...unavailableContacts,
      ...classified.affiliations,
    ];
    const approvedSourceIds = new Set(items.map((item) => item.source.sourceId));
    const normalized = normalizeApprovedRecruitmentEvidence(items, approvedSourceIds);
    normalized.koreanLanguageActivity = evaluateKoreanLanguageActivity(snapshot, checkedAt);
    normalized.exploratoryDiscoveryPhrases = extractSafeDiscoveryPhrases([
      snapshot.channelDescription ?? "",
      ...snapshot.recentVideos.flatMap((video) => [video.title, video.description ?? ""]),
    ], snapshot.channelTitle);
    return {
      normalized,
      raw: {
        items,
        summary: {
          sourceUrls: [
            `https://www.youtube.com/channel/${snapshot.channelId}`,
            ...snapshot.recentVideos.map((video) => `https://www.youtube.com/watch?v=${video.videoId}`),
            ...officialSites.flatMap((site) => site.pages.map((page) => page.url)),
          ],
          checkedAt,
          stopReasons: [...new Set(officialSites.flatMap((site) => site.stopReasons))],
          itemCount: items.length,
        },
      },
    };
  }

  private getYouTubeClient(): Promise<YouTubeRecruitmentSourceClient> {
    this.youtubeClientPromise ??= this.youtubeClientFactory();
    return this.youtubeClientPromise;
  }
}

async function createRuntimeYouTubeClient(): Promise<YouTubeRecruitmentSourceClient> {
  return new YouTubeDataApiRecruitmentClient(loadYouTubeProviderConfig());
}

function unavailableSiteObservations(site: OfficialSiteCollection, checkedAt: string): RawPublicContactEvidence[] {
  if (site.stopReasons.length === 0 || site.pages.length > 0) return [];
  return [{
    kind: "contact",
    source: {
      sourceId: `official-site:${site.requestedUrl}`,
      sourceType: "creator_official_website",
      publicUrl: site.requestedUrl,
    },
    checkedAt,
    verificationState: "not_checked",
    email: null,
    declaredOwnerType: "not_checked",
  }];
}

function unavailableResult(
  request: RecruitmentEvidenceRequest,
  checkedAt: string,
  stopReason: PublicPageStopReason,
): RecruitmentEvidenceResult<LiveRecruitmentRawResult> {
  const normalized = createUncheckedRecruitmentEvidence();
  normalized.koreanLanguageActivity = {
    ...normalized.koreanLanguageActivity,
    verifiedAt: checkedAt,
    sources: [{
      sourceId: `youtube-channel:${request.channelId}`,
      sourceType: "youtube_channel_about",
      publicUrl: request.canonicalChannelUrl,
      approved: true,
    }],
  };
  return {
    normalized,
    raw: {
      items: [],
      summary: { sourceUrls: [request.canonicalChannelUrl], checkedAt, stopReasons: [stopReason], itemCount: 0 },
    },
  };
}

function validateRequest(request: RecruitmentEvidenceRequest): void {
  if (!request.channelId.trim() || !request.channelName.trim() || !request.canonicalChannelUrl.trim()) {
    throw new LiveRecruitmentProviderError("invalid_input");
  }
}

function isExpectedUnavailable(error: unknown): boolean {
  return error instanceof YouTubeProviderError || (error instanceof DOMException && error.name === "TimeoutError");
}

function unavailableReason(error: unknown): PublicPageStopReason {
  if (error instanceof DOMException && error.name === "TimeoutError") return "timeout";
  if (error instanceof YouTubeProviderError && ["access_restricted", "unauthorized"].includes(error.category)) return "access_restricted";
  if (error instanceof YouTubeProviderError && ["quota_exceeded", "rate_limited"].includes(error.category)) return "rate_limited";
  return "temporary_failure";
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new DOMException("Request timed out.", "TimeoutError")), timeoutMs);
    promise.then(
      (value) => { clearTimeout(timeout); resolve(value); },
      (error: unknown) => { clearTimeout(timeout); reject(error); },
    );
  });
}
