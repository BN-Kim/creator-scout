import { afterEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import { defaultRecommendationSettings } from "@/config/recommendation-rules";
import { mockCreatorInputs } from "@/data/creators";
import { openDatabase } from "@/server/database/database";
import { createHistoryRecord } from "@/server/history/history-record";
import type { HistoryRepository } from "@/server/history/history-repository";
import type { RecruitmentEvidenceProvider } from "@/server/providers/recruitment/provider-contract";
import { createUncheckedRecruitmentEvidence } from "@/server/providers/recruitment/approved-public-provider";
import { SqliteHistoryRepository } from "@/server/history/sqlite-history-repository";
import type {
  YouTubeCandidateDiscoveryProvider,
  YouTubeEvidenceProvider,
  YouTubeIdentityProvider,
} from "@/server/providers/youtube/provider-contracts";
import { YouTubeProviderError } from "@/server/providers/youtube/provider-error";
import type {
  DiscoveredYouTubeCandidate,
  NormalizedChannelEvidence,
  RecentVideoEvidence,
  ResolvedYouTubeIdentity,
} from "@/server/providers/youtube/provider-types";
import { evaluateCreator } from "@/server/rules/evaluate-creator";
import { AutomaticScoutingPipeline } from "@/server/scouting/automatic-scouting-pipeline";
import type { CreatorInputAssembler } from "@/server/scouting/creator-input-assembler";
import type { CreatorInput, HistoryRecord } from "@/types/domain";

const NOW = new Date("2026-07-22T06:00:00.000Z");
const CHANNEL_A = `UC${"a".repeat(22)}`;
const CHANNEL_B = `UC${"b".repeat(22)}`;
const CHANNEL_C = `UC${"c".repeat(22)}`;
const CHANNEL_D = `UC${"d".repeat(22)}`;
const databases: Database.Database[] = [];

afterEach(() => {
  for (const database of databases.splice(0)) database.close();
});

describe("automatic scouting pipeline", () => {
  it("prechecks exact prior history and never calls evidence or evaluation for that identity", async () => {
    const repository = createRepository();
    repository.addOrUpdate(historyRecordFor(CHANNEL_A));
    const harness = createHarness([CHANNEL_A], repository);
    const result = await harness.pipeline.run(request(1));

    expect(harness.calls).toMatchObject({ identity: 1, channelEvidence: 0, recentVideos: 0, assembled: 0 });
    expect(harness.events).toEqual([`identity:${CHANNEL_A}`, `history:${CHANNEL_A}`]);
    expect(result.results).toEqual([]);
    expect(result.statistics).toMatchObject({ discovered: 1, skippedDuplicates: 1, skippedPriorHistory: 1, evaluated: 0, failed: 0 });
    expect(repository.load()).toHaveLength(1);
  });

  it("processes the same stable channel ID once per run and does not create duplicate history", async () => {
    const repository = createRepository();
    const harness = createHarness([CHANNEL_A, CHANNEL_A], repository);
    const result = await harness.pipeline.run(request(2));

    expect(harness.calls).toMatchObject({ identity: 2, channelEvidence: 1, recentVideos: 1, assembled: 1 });
    expect(result.results).toHaveLength(1);
    expect(result.skips).toContainEqual({ channelId: CHANNEL_A, reason: "same_run", matchedHistoryRecordId: null });
    expect(result.statistics).toMatchObject({ discovered: 2, skippedDuplicates: 1, skippedSameRun: 1, evaluated: 1, hold: 1 });
    expect(repository.load()).toHaveLength(1);
  });

  it("evaluates and persists each genuinely new creator exactly once with correct decision statistics", async () => {
    const repository = createRepository();
    const assembler = scenarioAssembler(new Map([[CHANNEL_A, 0], [CHANNEL_B, 1], [CHANNEL_C, 9]]));
    const harness = createHarness([CHANNEL_A, CHANNEL_B, CHANNEL_C], repository, { assembler });
    const result = await harness.pipeline.run(request(3));

    expect(result.results.map((creator) => creator.decision)).toEqual(["recommended", "hold", "excluded"]);
    expect(result.statistics).toEqual({
      discovered: 3,
      skippedDuplicates: 0,
      skippedPriorHistory: 0,
      skippedSameRun: 0,
      evaluated: 3,
      recommended: 1,
      hold: 1,
      excluded: 1,
      failed: 0,
    });
    expect(repository.load().map((record) => record.finalDecision).sort()).toEqual(["excluded", "hold", "recommended"]);
    expect(harness.calls.assembled).toBe(3);
  });

  it("maps H3 normalized evidence into the existing CreatorInput contract and saves the decision", async () => {
    const repository = createRepository();
    const harness = createHarness([CHANNEL_A], repository, { useDefaultAssembler: true });
    const result = await harness.pipeline.run(request(1));

    expect(result.results[0]).toMatchObject({
      decision: "hold",
      identity: { youtubeChannelId: CHANNEL_A, category: "뷰티", identityVerificationState: "confirmed" },
      evidence: { evidenceSource: "fictional_mock", recentVideoCount: 5, recentAverageViews: 15000 },
    });
    expect(repository.load()).toHaveLength(1);
  });

  it("is idempotent across a completed retry and displays only newly processed results", async () => {
    const repository = createRepository();
    const assembler = scenarioAssembler(new Map([[CHANNEL_A, 0], [CHANNEL_B, 1]]));
    const firstHarness = createHarness([CHANNEL_A, CHANNEL_B], repository, { assembler });
    const first = await firstHarness.pipeline.run(request(2));
    const secondHarness = createHarness([CHANNEL_A, CHANNEL_B], repository, { assembler });
    const second = await secondHarness.pipeline.run(request(2));

    expect(first.results).toHaveLength(2);
    expect(second.results).toEqual([]);
    expect(secondHarness.calls).toMatchObject({ channelEvidence: 0, recentVideos: 0, assembled: 0 });
    expect(second.statistics).toMatchObject({ skippedPriorHistory: 2, skippedDuplicates: 2, evaluated: 0 });
    expect(repository.load()).toHaveLength(2);
  });

  it("isolates a provider failure and continues processing remaining candidates", async () => {
    const repository = createRepository();
    const assembler = scenarioAssembler(new Map([[CHANNEL_A, 0], [CHANNEL_C, 1]]));
    const harness = createHarness([CHANNEL_A, CHANNEL_B, CHANNEL_C], repository, {
      assembler,
      evidenceFailureChannelId: CHANNEL_B,
    });
    const result = await harness.pipeline.run(request(3));

    expect(result.results).toHaveLength(2);
    expect(result.statistics).toMatchObject({ discovered: 3, evaluated: 2, failed: 1, recommended: 1, hold: 1 });
    expect(result.status).toBe("completed_with_failures");
    expect(result.failures).toContainEqual({
      stage: "evidence_collection",
      candidateChannelId: CHANNEL_B,
      category: "temporary",
      retryable: true,
      message: "YouTube 공급자 처리 중 오류가 발생했습니다.",
    });
    expect(repository.load()).toHaveLength(2);
  });

  it("does not expose or count a decision whose history write failed", async () => {
    const backingRepository = createRepository();
    const repository = failWritesFor(backingRepository, CHANNEL_B);
    const assembler = scenarioAssembler(new Map([[CHANNEL_A, 0], [CHANNEL_B, 1]]));
    const harness = createHarness([CHANNEL_A, CHANNEL_B], repository, { assembler });
    const result = await harness.pipeline.run(request(2));

    expect(result.statistics).toMatchObject({ discovered: 2, evaluated: 2, recommended: 1, hold: 0, failed: 1 });
    expect(result.results.map((creator) => creator.identity.youtubeChannelId)).toEqual([CHANNEL_A]);
    expect(result.failures[0]).toMatchObject({ stage: "persistence", category: "storage", retryable: true });
    expect(backingRepository.load()).toHaveLength(1);
  });

  it("honors the configured target batch across provider pages", async () => {
    const repository = createRepository();
    const pages = [[CHANNEL_A, CHANNEL_B], [CHANNEL_C, CHANNEL_D]];
    const discoveryCalls: number[] = [];
    const discoveryProvider: YouTubeCandidateDiscoveryProvider = {
      discoverCandidates: async ({ maxResults, pageToken }) => {
        discoveryCalls.push(maxResults);
        const index = pageToken ? Number(pageToken) : 0;
        return {
          candidates: pages[index].map(candidate),
          nextPageToken: index + 1 < pages.length ? String(index + 1) : null,
          raw: { fixture: true },
        };
      },
    };
    const harness = createHarness([], repository, { discoveryProvider });
    const result = await harness.pipeline.run(request(3));

    expect(discoveryCalls).toEqual([3, 1]);
    expect(result.statistics.discovered).toBe(3);
    expect(result.results).toHaveLength(3);
  });

  it("collects normalized H5 evidence only for new identities and keeps repeated runs idempotent", async () => {
    const repository = createRepository();
    const recruitmentProvider = fictionalRecruitmentProvider();
    const firstHarness = createHarness([CHANNEL_A], repository, { useDefaultAssembler: true, recruitmentProvider });
    const first = await firstHarness.pipeline.run(request(1));
    const secondHarness = createHarness([CHANNEL_A], repository, { useDefaultAssembler: true, recruitmentProvider });
    const second = await secondHarness.pipeline.run(request(1));

    expect(firstHarness.calls.recruitmentEvidence).toBe(1);
    expect(first.results[0].evidence).toMatchObject({
      visibleEmail: "h5-pipeline@example.invalid",
      emailClassification: "personal",
      emailVerificationState: "confirmed",
    });
    expect(first.results[0].evidence.recruitmentEvidence.contacts[0].source).toMatchObject({
      sourceId: "h5-fictional-pipeline",
      approved: true,
    });
    expect(secondHarness.calls.recruitmentEvidence).toBe(0);
    expect(second.results).toEqual([]);
    expect(repository.load()).toHaveLength(1);
  });

  it("isolates a recruitment evidence failure without exposing a result or stopping other candidates", async () => {
    const repository = createRepository();
    const recruitmentProvider: RecruitmentEvidenceProvider = {
      collectEvidence: async ({ channelId }) => {
        if (channelId === CHANNEL_B) throw new Error("fictional private response body");
        return { normalized: fictionalRecruitmentEvidence(), raw: { fixture: true } };
      },
    };
    const harness = createHarness([CHANNEL_A, CHANNEL_B, CHANNEL_C], repository, {
      assembler: scenarioAssembler(new Map([[CHANNEL_A, 0], [CHANNEL_C, 1]])),
      recruitmentProvider,
    });
    const result = await harness.pipeline.run(request(3));

    expect(result.results).toHaveLength(2);
    expect(result.failures).toContainEqual({
      stage: "recruitment_evidence",
      candidateChannelId: CHANNEL_B,
      category: "internal",
      retryable: false,
      message: "자동 스카우팅 처리 중 오류가 발생했습니다.",
    });
    expect(JSON.stringify(result)).not.toContain("fictional private response body");
    expect(repository.load()).toHaveLength(2);
  });
});

function createRepository(): SqliteHistoryRepository {
  const database = openDatabase(":memory:");
  databases.push(database);
  return new SqliteHistoryRepository(database);
}

function request(targetCount: number) {
  return {
    runId: "h4-fictional-run",
    query: "허구 목 검색어",
    category: "뷰티",
    targetCount,
    recentVideoLimit: 5,
    settings: defaultRecommendationSettings,
  };
}

function candidate(channelId: string): DiscoveredYouTubeCandidate {
  return {
    channelId,
    discoveredTitle: `허구 채널 ${channelId.at(-1)}`,
    identityInput: { kind: "channel_id", value: channelId },
    sourceQuery: "허구 목 검색어",
  };
}

function resolvedIdentity(channelId: string): ResolvedYouTubeIdentity {
  return {
    channelId,
    channelName: `허구 채널 ${channelId.at(-1)}`,
    handle: null,
    canonicalChannelUrl: `https://www.youtube.com/channel/${channelId}`,
    resolvedFrom: "channel_id",
  };
}

interface HarnessOptions {
  assembler?: CreatorInputAssembler;
  useDefaultAssembler?: boolean;
  evidenceFailureChannelId?: string;
  discoveryProvider?: YouTubeCandidateDiscoveryProvider;
  recruitmentProvider?: RecruitmentEvidenceProvider;
}

function createHarness(candidateIds: string[], repository: HistoryRepository, options: HarnessOptions = {}) {
  const calls = { identity: 0, channelEvidence: 0, recentVideos: 0, recruitmentEvidence: 0, assembled: 0 };
  const events: string[] = [];
  const originalFindDuplicate = repository.findDuplicate.bind(repository);
  repository.findDuplicate = (identity) => {
    events.push(`history:${identity.youtubeChannelId}`);
    return originalFindDuplicate(identity);
  };
  const identityProvider: YouTubeIdentityProvider = {
    resolveIdentity: async (input) => {
      calls.identity += 1;
      const channelId = input.value;
      events.push(`identity:${channelId}`);
      return { identity: resolvedIdentity(channelId), raw: { fixture: true } };
    },
  };
  const evidenceProvider: YouTubeEvidenceProvider = {
    getChannelEvidence: async (identity) => {
      calls.channelEvidence += 1;
      events.push(`channel:${identity.channelId}`);
      if (identity.channelId === options.evidenceFailureChannelId) {
        throw new YouTubeProviderError("fictional temporary failure", {
          category: "temporary", operation: "channel_evidence", retryable: true,
        });
      }
      return { normalized: channelEvidence(identity), raw: { fixture: true } };
    },
    getRecentVideoEvidence: async (identity) => {
      calls.recentVideos += 1;
      events.push(`videos:${identity.channelId}`);
      return { normalized: recentVideoEvidence(), raw: { fixture: true } };
    },
  };
  const baseAssembler = options.assembler ?? scenarioAssembler(new Map());
  const assembler: CreatorInputAssembler = (identity, evidence, context) => {
    calls.assembled += 1;
    return baseAssembler(identity, evidence, context);
  };
  const discoveryProvider: YouTubeCandidateDiscoveryProvider = options.discoveryProvider ?? {
    discoverCandidates: async () => ({ candidates: candidateIds.map(candidate), nextPageToken: null, raw: { fixture: true } }),
  };
  const recruitmentProvider = options.recruitmentProvider ? {
    collectEvidence: async (request) => {
      calls.recruitmentEvidence += 1;
      return options.recruitmentProvider!.collectEvidence(request);
    },
  } satisfies RecruitmentEvidenceProvider : undefined;
  return {
    calls,
    events,
    pipeline: new AutomaticScoutingPipeline({
      discoveryProvider,
      identityProvider,
      evidenceProvider,
      ...(recruitmentProvider ? { recruitmentEvidenceProvider: recruitmentProvider } : {}),
      historyRepository: repository,
      ...(options.useDefaultAssembler ? {} : { assembleCreatorInput: assembler }),
      now: () => NOW,
    }),
  };
}

function fictionalRecruitmentProvider(): RecruitmentEvidenceProvider {
  return { collectEvidence: async () => ({ normalized: fictionalRecruitmentEvidence(), raw: { fixture: true } }) };
}

function fictionalRecruitmentEvidence() {
  const source = {
    sourceId: "h5-fictional-pipeline",
    sourceType: "youtube_channel_about" as const,
    publicUrl: "https://www.youtube.com/@h5-fictional-pipeline/about",
    approved: true as const,
  };
  return {
    ...createUncheckedRecruitmentEvidence(),
    contacts: [{
      email: "h5-pipeline@example.invalid",
      classification: "personal" as const,
      verificationState: "confirmed" as const,
      verifiedAt: NOW.toISOString(),
      source,
    }],
  };
}

function channelEvidence(identity: ResolvedYouTubeIdentity): NormalizedChannelEvidence {
  return {
    evidenceSource: "fictional_mock",
    channelId: identity.channelId,
    channelName: identity.channelName,
    handle: identity.handle,
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
    videoId: `fictional-video-${index}`,
    publishedAt: `2026-07-${String(20 - index).padStart(2, "0")}T00:00:00Z`,
    viewCount: 15000,
    durationSeconds: 600,
    durationClass: "long_form_length" as const,
  }));
  return { videos, shortsLengthSamples: [], longFormLengthSamples: videos, unknownDurationSamples: [], unavailableVideoIds: [] };
}

function scenarioAssembler(scenarios: Map<string, number>): CreatorInputAssembler {
  return (identity) => {
    const source = mockCreatorInputs[scenarios.get(identity.channelId) ?? 1];
    return {
      ...source,
      identity: {
        ...source.identity,
        internalId: `youtube:${identity.channelId}`,
        channelName: identity.channelName,
        normalizedChannelName: identity.channelName.toLocaleLowerCase("ko-KR"),
        canonicalChannelUrl: identity.canonicalChannelUrl,
        youtubeChannelId: identity.channelId,
        youtubeHandle: identity.handle,
        sourceUrls: [identity.canonicalChannelUrl],
      },
    };
  };
}

function historyRecordFor(channelId: string): HistoryRecord {
  const input = scenarioAssembler(new Map([[channelId, 0]]))(resolvedIdentity(channelId), {
    channel: channelEvidence(resolvedIdentity(channelId)),
    recentVideos: recentVideoEvidence(),
    verificationEvidence: mockCreatorInputs[0].evidence,
  }, { category: "뷰티", sourceQuery: "허구" });
  const evaluation = evaluateCreator(input, defaultRecommendationSettings, [], [], NOW);
  return createHistoryRecord({ ...input, ...evaluation }, "prior-fictional-run");
}

function failWritesFor(repository: HistoryRepository, channelId: string): HistoryRepository {
  return {
    load: () => repository.load(),
    search: (filters) => repository.search(filters),
    findDuplicate: (identity) => repository.findDuplicate(identity),
    addOrUpdate: (record) => {
      if (record.identity.youtubeChannelId === channelId) throw new Error("fictional storage failure");
      return repository.addOrUpdate(record);
    },
    replace: (records) => repository.replace(records),
  };
}
