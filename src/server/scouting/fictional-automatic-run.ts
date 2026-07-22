import { defaultRecommendationSettings } from "@/config/recommendation-rules";
import { mockCreatorInputs } from "@/data/creators";
import { createHistoryRecord } from "@/server/history/history-record";
import type { HistoryRepository } from "@/server/history/history-repository";
import type {
  YouTubeCandidateDiscoveryProvider,
  YouTubeEvidenceProvider,
  YouTubeIdentityProvider,
} from "@/server/providers/youtube/provider-contracts";
import { YouTubeProviderError } from "@/server/providers/youtube/provider-error";
import type { NormalizedChannelEvidence, RecentVideoEvidence, ResolvedYouTubeIdentity } from "@/server/providers/youtube/provider-types";
import { evaluateCreator } from "@/server/rules/evaluate-creator";
import { AutomaticScoutingPipeline } from "@/server/scouting/automatic-scouting-pipeline";
import type { AutomaticScoutingRunResult } from "@/server/scouting/automatic-scouting-types";
import type { CreatorInputAssembler } from "@/server/scouting/creator-input-assembler";

const FIXED_NOW = new Date("2026-07-22T06:00:00.000Z");
const channelIds = {
  prior: `UC${"p".repeat(22)}`,
  recommended: `UC${"r".repeat(22)}`,
  hold: `UC${"h".repeat(22)}`,
  excluded: `UC${"x".repeat(22)}`,
  failed: `UC${"f".repeat(22)}`,
} as const;

const channelNames: Record<string, string> = {
  [channelIds.prior]: "H4 허구 과거 채널",
  [channelIds.recommended]: "H4 허구 추천 채널",
  [channelIds.hold]: "H4 허구 보류 채널",
  [channelIds.excluded]: "H4 허구 제외 채널",
  [channelIds.failed]: "H4 허구 실패 채널",
};

export async function runFictionalAutomaticScouting(
  historyRepository: HistoryRepository,
  runId = "automatic-h4-mock-run",
): Promise<AutomaticScoutingRunResult> {
  seedPriorHistory(historyRepository);
  const discoveredIds = [
    channelIds.prior,
    channelIds.recommended,
    channelIds.recommended,
    channelIds.hold,
    channelIds.excluded,
    channelIds.failed,
  ];
  const discoveryProvider: YouTubeCandidateDiscoveryProvider = {
    discoverCandidates: async ({ query }) => ({
      candidates: discoveredIds.map((channelId) => ({
        channelId,
        discoveredTitle: channelNames[channelId],
        identityInput: { kind: "channel_id", value: channelId },
        sourceQuery: query,
      })),
      nextPageToken: null,
      raw: { fixture: "H4 fictional discovery" },
    }),
  };
  const identityProvider: YouTubeIdentityProvider = {
    resolveIdentity: async (input) => ({ identity: resolvedIdentity(input.value), raw: { fixture: "H4 fictional identity" } }),
  };
  const evidenceProvider: YouTubeEvidenceProvider = {
    getChannelEvidence: async (identity) => {
      if (identity.channelId === channelIds.failed) {
        throw new YouTubeProviderError("Fictional isolated provider failure", {
          category: "temporary", operation: "channel_evidence", retryable: true,
        });
      }
      return { normalized: channelEvidence(identity), raw: { fixture: "H4 fictional channel evidence" } };
    },
    getRecentVideoEvidence: async () => ({
      normalized: recentVideoEvidence(),
      raw: { fixture: "H4 fictional video evidence" },
    }),
  };
  const pipeline = new AutomaticScoutingPipeline({
    discoveryProvider,
    identityProvider,
    evidenceProvider,
    historyRepository,
    assembleCreatorInput: fictionalAssembler,
    now: () => FIXED_NOW,
  });
  return pipeline.run({
    runId,
    query: "H4 허구 자동 스카우팅",
    category: "뷰티",
    targetCount: discoveredIds.length,
    recentVideoLimit: 5,
    settings: defaultRecommendationSettings,
  });
}

function seedPriorHistory(historyRepository: HistoryRepository): void {
  const identity = resolvedIdentity(channelIds.prior);
  const input = fictionalAssembler(identity, {
    channel: channelEvidence(identity),
    recentVideos: recentVideoEvidence(),
    verificationEvidence: mockCreatorInputs[0].evidence,
  }, { category: "뷰티", sourceQuery: "H4 허구 과거 실행" });
  const evaluation = evaluateCreator(input, defaultRecommendationSettings, [], [], FIXED_NOW);
  historyRepository.addOrUpdate(createHistoryRecord({ ...input, ...evaluation }, "h4-fictional-prior-run"));
}

const fictionalAssembler: CreatorInputAssembler = (identity) => {
  const scenarioIndex = identity.channelId === channelIds.recommended ? 0 : identity.channelId === channelIds.excluded ? 9 : 1;
  const source = mockCreatorInputs[scenarioIndex];
  return {
    ...source,
    identity: {
      ...source.identity,
      internalId: `youtube:${identity.channelId}`,
      channelName: identity.channelName,
      normalizedChannelName: identity.channelName.toLocaleLowerCase("ko-KR"),
      canonicalChannelUrl: identity.canonicalChannelUrl,
      youtubeChannelId: identity.channelId,
      youtubeHandle: null,
      sourceUrls: [identity.canonicalChannelUrl],
      category: "뷰티",
    },
    mockScenario: "H4 자동 파이프라인 전용 허구 근거",
  };
};

function resolvedIdentity(channelId: string): ResolvedYouTubeIdentity {
  return {
    channelId,
    channelName: channelNames[channelId] ?? "H4 허구 채널",
    handle: null,
    canonicalChannelUrl: `https://www.youtube.com/channel/${channelId}`,
    resolvedFrom: "channel_id",
  };
}

function channelEvidence(identity: ResolvedYouTubeIdentity): NormalizedChannelEvidence {
  return {
    channelId: identity.channelId,
    channelName: identity.channelName,
    handle: null,
    canonicalChannelUrl: identity.canonicalChannelUrl,
    subscriberCount: 42000,
    subscriberCountHidden: false,
    publicVideoCount: 20,
    channelPublishedAt: "2024-01-01T00:00:00Z",
    country: "KR",
    uploadsPlaylistId: `UU${identity.channelId.slice(2)}`,
  };
}

function recentVideoEvidence(): RecentVideoEvidence {
  const videos = [1, 2, 3, 4, 5].map((index) => ({
    videoId: `h4-fictional-video-${index}`,
    publishedAt: `2026-07-${String(20 - index).padStart(2, "0")}T00:00:00Z`,
    viewCount: 15000,
    durationSeconds: 600,
    durationClass: "long_form_length" as const,
  }));
  return { videos, shortsLengthSamples: [], longFormLengthSamples: videos, unknownDurationSamples: [], unavailableVideoIds: [] };
}
