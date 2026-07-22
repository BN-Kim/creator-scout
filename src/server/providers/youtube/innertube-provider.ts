import { isStableYouTubeChannelId, parseYouTubeIdentityInput } from "@/server/providers/youtube/identity-input";
import type {
  InnerTubeChannelSnapshot,
  InnerTubeClient,
  InnerTubeRecentVideosSnapshot,
} from "@/server/providers/youtube/innertube-client";
import { InnerTubeBridgeError } from "@/server/providers/youtube/innertube-client";
import type {
  YouTubeCandidateDiscoveryProvider,
  YouTubeEvidenceProvider,
  YouTubeIdentityProvider,
} from "@/server/providers/youtube/provider-contracts";
import type { InnerTubeProviderConfig } from "@/server/providers/youtube/provider-config";
import { YouTubeProviderError, type YouTubeProviderErrorCategory } from "@/server/providers/youtube/provider-error";
import type {
  CandidateDiscoveryRequest,
  CandidateDiscoveryResult,
  ChannelEvidenceResult,
  IdentityResolutionResult,
  NormalizedVideoEvidence,
  RecentVideoEvidenceResult,
  RecentVideoRequest,
  ResolvedYouTubeIdentity,
  YouTubeIdentityInput,
} from "@/server/providers/youtube/provider-types";

export interface InnerTubeProviderDependencies {
  clientFactory?: () => Promise<InnerTubeClient>;
  delay?: (milliseconds: number) => Promise<void>;
}

export class InnerTubeYouTubeProvider implements YouTubeCandidateDiscoveryProvider, YouTubeIdentityProvider, YouTubeEvidenceProvider {
  private clientPromise: Promise<InnerTubeClient> | null = null;
  private readonly clientFactory: () => Promise<InnerTubeClient>;
  private readonly delay: (milliseconds: number) => Promise<void>;

  constructor(private readonly config: InnerTubeProviderConfig, dependencies: InnerTubeProviderDependencies = {}) {
    this.clientFactory = dependencies.clientFactory ?? createRuntimeClient;
    this.delay = dependencies.delay ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  }

  async discoverCandidates(request: CandidateDiscoveryRequest): Promise<CandidateDiscoveryResult> {
    const query = request.query.trim();
    if (!query || !Number.isInteger(request.maxResults) || request.maxResults < 1 || request.maxResults > 50) {
      throw providerError("discover_candidates", "invalid_input", false);
    }
    const snapshot = await this.execute("discover_candidates", (client) =>
      client.discoverChannels(query, request.maxResults, request.pageToken));
    return {
      candidates: snapshot.channels.flatMap((channel) => isStableYouTubeChannelId(channel.channelId) ? [{
        channelId: channel.channelId,
        discoveredTitle: channel.channelName,
        identityInput: { kind: "channel_id" as const, value: channel.channelId },
        sourceQuery: query,
      }] : []),
      nextPageToken: snapshot.nextPageToken,
      raw: snapshot.raw,
    };
  }

  async resolveIdentity(input: YouTubeIdentityInput): Promise<IdentityResolutionResult> {
    const lookup = parseYouTubeIdentityInput(input);
    const snapshot = await this.execute("resolve_identity", (client) => client.resolveChannel(lookup));
    validateChannelSnapshot(snapshot, "resolve_identity");
    return {
      identity: {
        channelId: snapshot.channelId,
        channelName: snapshot.channelName,
        handle: normalizedHandle(snapshot.handle),
        canonicalChannelUrl: `https://www.youtube.com/channel/${snapshot.channelId}`,
        resolvedFrom: lookup.resolvedFrom,
      },
      raw: snapshot.raw,
    };
  }

  async getChannelEvidence(identity: ResolvedYouTubeIdentity): Promise<ChannelEvidenceResult> {
    const snapshot = await this.execute("get_channel_evidence", (client) => client.getChannel(identity.channelId));
    validateChannelSnapshot(snapshot, "get_channel_evidence");
    if (snapshot.channelId !== identity.channelId) throw providerError("get_channel_evidence", "response_invalid", false);
    const subscriberCount = parsePublicCount(snapshot.subscriberText);
    return {
      normalized: {
        evidenceSource: "youtubejs_innertube",
        channelId: snapshot.channelId,
        channelName: snapshot.channelName,
        handle: normalizedHandle(snapshot.handle) ?? identity.handle,
        canonicalChannelUrl: `https://www.youtube.com/channel/${snapshot.channelId}`,
        subscriberCount,
        subscriberCountHidden: subscriberCount === null,
        publicVideoCount: parsePublicCount(snapshot.publicVideoCountText),
        channelPublishedAt: null,
        country: null,
        uploadsPlaylistId: null,
      },
      raw: snapshot.raw,
    };
  }

  async getRecentVideoEvidence(identity: ResolvedYouTubeIdentity, request: RecentVideoRequest): Promise<RecentVideoEvidenceResult> {
    if (!Number.isInteger(request.maxResults) || request.maxResults < 1 || request.maxResults > 50) {
      throw providerError("get_recent_videos", "invalid_input", false);
    }
    const snapshot = await this.execute("get_recent_videos", (client) => client.getRecentVideos(identity.channelId, request.maxResults));
    return normalizeRecentVideos(snapshot);
  }

  private async execute<T>(operation: string, action: (client: InnerTubeClient) => Promise<T>): Promise<T> {
    let attempt = 0;
    while (true) {
      attempt += 1;
      try {
        return await withTimeout(this.getClient().then(action), this.config.requestTimeoutMs);
      } catch (error: unknown) {
        const normalized = normalizeProviderError(error, operation);
        if (!normalized.retryable || attempt > this.config.maxRetries) throw normalized;
        this.clientPromise = null;
        await this.delay(this.config.retryBaseDelayMs * 2 ** (attempt - 1));
      }
    }
  }

  private getClient(): Promise<InnerTubeClient> {
    this.clientPromise ??= this.clientFactory();
    return this.clientPromise;
  }
}

async function createRuntimeClient(): Promise<InnerTubeClient> {
  const runtime = await import("@/server/providers/youtube/youtubejs-runtime");
  return runtime.createYouTubeJsInnerTubeClient();
}

function validateChannelSnapshot(snapshot: InnerTubeChannelSnapshot, operation: string): void {
  if (!isStableYouTubeChannelId(snapshot.channelId) || !snapshot.channelName.trim()) {
    throw providerError(operation, "response_invalid", false);
  }
}

function normalizeRecentVideos(snapshot: InnerTubeRecentVideosSnapshot): RecentVideoEvidenceResult {
  if (snapshot.collectionState === "unavailable") {
    throw providerError("get_recent_videos", "evidence_unavailable", true);
  }
  if (snapshot.collectionState === "unsupported" || snapshot.collectionState === "malformed") {
    throw providerError("get_recent_videos", "provider_incompatible", false);
  }
  const videos: NormalizedVideoEvidence[] = snapshot.videos.flatMap((video) => {
    if (!video.videoId.trim()) return [];
    const durationSeconds = validDuration(video.durationSeconds);
    return [{
      videoId: video.videoId,
      publishedAt: exactDateTime(video.publishedAt),
      viewCount: parsePublicCount(video.viewCountText),
      durationSeconds,
      durationClass: durationSeconds === null ? "unknown" : durationSeconds <= 180 ? "shorts_length" : "long_form_length",
    }];
  });
  return {
    normalized: {
      videos,
      shortsLengthSamples: videos.filter((video) => video.durationClass === "shorts_length"),
      longFormLengthSamples: videos.filter((video) => video.durationClass === "long_form_length"),
      unknownDurationSamples: videos.filter((video) => video.durationClass === "unknown"),
      unavailableVideoIds: [...new Set(snapshot.unavailableVideoIds.filter((id) => id.trim()))],
    },
    raw: snapshot.raw,
  };
}

export function parsePublicCount(value: string | null): number | null {
  if (!value) return null;
  const compact = value.trim().toUpperCase().replace(/,/g, "");
  const match = /^(\d+(?:\.\d+)?)\s*([KMB])?(?:\s|$)/.exec(compact);
  if (!match) return null;
  const amount = Number(match[1]);
  const multiplier = match[2] === "K" ? 1_000 : match[2] === "M" ? 1_000_000 : match[2] === "B" ? 1_000_000_000 : 1;
  const result = Math.round(amount * multiplier);
  return Number.isSafeInteger(result) ? result : null;
}

function normalizedHandle(value: string | null): string | null {
  const handle = value?.trim();
  return handle?.startsWith("@") && handle.length > 1 ? handle : null;
}

function exactDateTime(value: string | null): string | null {
  if (!value || Number.isNaN(Date.parse(value))) return null;
  return new Date(value).toISOString();
}

function validDuration(value: number | null): number | null {
  return value !== null && Number.isFinite(value) && value >= 0 ? Math.round(value) : null;
}

function normalizeProviderError(error: unknown, operation: string): YouTubeProviderError {
  if (error instanceof YouTubeProviderError) return error;
  if (error instanceof InnerTubeBridgeError) {
    return providerError(operation, error.category, error.category === "temporary");
  }
  if (isAbortError(error)) return providerError(operation, "timeout", true);
  if (isTemporaryNetworkError(error)) return providerError(operation, "temporary", true);
  return providerError(operation, "provider_incompatible", false);
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
}

function isTemporaryNetworkError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return /fetch failed|network|socket|ECONN|ENOTFOUND|EAI_AGAIN/i.test(error.message);
}

function providerError(operation: string, category: YouTubeProviderErrorCategory, retryable: boolean): YouTubeProviderError {
  return new YouTubeProviderError("YouTube provider operation failed.", { category, operation, retryable });
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new DOMException("Provider request timed out.", "TimeoutError")), timeoutMs);
    promise.then(
      (value) => { clearTimeout(timeout); resolve(value); },
      (error: unknown) => { clearTimeout(timeout); reject(error); },
    );
  });
}
