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
import { InMemoryDiscoveryStateRepository } from "@/server/discovery/in-memory-discovery-state-repository";
import type { DiscoveryStateRepository } from "@/server/discovery/discovery-state-repository";
import type { AutomaticScoutingSafetyLimits } from "@/server/scouting/automatic-scouting-types";
import type { CreatorInputAssembler } from "@/server/scouting/creator-input-assembler";
import type { CreatorInput, HistoryRecord } from "@/types/domain";

const NOW = new Date("2026-07-22T06:00:00.000Z");
const CHANNEL_A = `UC${"a".repeat(22)}`;
const CHANNEL_B = `UC${"b".repeat(22)}`;
const CHANNEL_C = `UC${"c".repeat(22)}`;
const CHANNEL_D = `UC${"d".repeat(22)}`;
const CHANNEL_E = `UC${"e".repeat(22)}`;
const CHANNEL_F = `UC${"f".repeat(22)}`;
const CHANNEL_G = `UC${"g".repeat(22)}`;
const CHANNEL_H = `UC${"h".repeat(22)}`;
const CHANNEL_I = `UC${"i".repeat(22)}`;
const databases: Database.Database[] = [];

afterEach(() => {
  for (const database of databases.splice(0)) database.close();
});

describe("automatic scouting pipeline", () => {
  it("prechecks exact prior history and never calls evidence or evaluation for that identity", async () => {
    const repository = createRepository();
    repository.addOrUpdate(historyRecordFor(CHANNEL_A));
    const harness = createHarness([CHANNEL_A], repository, { recruitmentProvider: fictionalRecruitmentProvider() });
    const result = await harness.pipeline.run(request(1));

    expect(harness.calls).toMatchObject({ identity: 1, channelEvidence: 0, recentVideos: 0, recruitmentEvidence: 0, assembled: 0 });
    expect(harness.events).toEqual([`identity:${CHANNEL_A}`, `history:${CHANNEL_A}`]);
    expect(result.results).toEqual([]);
    expect(result.statistics).toMatchObject({ discovered: 1, priorHistorySkipped: 1, sameRunDuplicatesSkipped: 0, evaluated: 0, failed: 0, stopReason: "source_exhausted" });
    expect(repository.load()).toHaveLength(1);
  });

  it("processes the same stable channel ID once per run and does not create duplicate history", async () => {
    const repository = createRepository();
    const harness = createHarness([CHANNEL_A, CHANNEL_A], repository);
    const result = await harness.pipeline.run(request(2));

    expect(harness.calls).toMatchObject({ identity: 2, channelEvidence: 1, recentVideos: 1, assembled: 1 });
    expect(result.results).toHaveLength(1);
    expect(result.skips).toContainEqual({ channelId: CHANNEL_A, reason: "same_run", matchedHistoryRecordId: null });
    expect(result.statistics).toMatchObject({ discovered: 2, priorHistorySkipped: 0, sameRunDuplicatesSkipped: 1, evaluated: 1, hold: 1, stopReason: "source_exhausted" });
    expect(repository.load()).toHaveLength(1);
  });

  it("evaluates and persists each genuinely new creator exactly once with correct decision statistics", async () => {
    const repository = createRepository();
    const assembler = scenarioAssembler(new Map([[CHANNEL_A, 0], [CHANNEL_B, 1], [CHANNEL_C, 11]]));
    const harness = createHarness([CHANNEL_A, CHANNEL_B, CHANNEL_C], repository, { assembler });
    const result = await harness.pipeline.run(request(2));

    expect(result.results.map((creator) => creator.decision)).toEqual(["recommended", "hold", "excluded"]);
    expect(result.statistics).toEqual({
      discoveryMode: "manual_replace",
      queriesAttempted: 1,
      pagesScanned: 1,
      targetRecommendedCount: 2,
      recommendationsFilled: 1,
      discovered: 3,
      priorHistorySkipped: 0,
      historyReevaluated: 0,
      manualOverrideSkipped: 0,
      sameRunDuplicatesSkipped: 0,
      evaluated: 3,
      recommended: 1,
      hold: 1,
      excluded: 1,
      failed: 0,
      stopReason: "source_exhausted",
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
      identity: {
        youtubeChannelId: CHANNEL_A,
        discoveryCategory: "뷰티",
        category: "미분류",
        identityVerificationState: "confirmed",
      },
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
    expect(second.statistics).toMatchObject({ priorHistorySkipped: 2, sameRunDuplicatesSkipped: 0, evaluated: 0, stopReason: "source_exhausted" });
    expect(repository.load()).toHaveLength(2);
  });

  it("isolates a provider failure and continues processing remaining candidates", async () => {
    const repository = createRepository();
    const assembler = scenarioAssembler(new Map([[CHANNEL_A, 0], [CHANNEL_C, 1]]));
    const harness = createHarness([CHANNEL_A, CHANNEL_B, CHANNEL_C], repository, {
      assembler,
      evidenceFailureChannelId: CHANNEL_B,
    });
    const result = await harness.pipeline.run(request(2));

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

  it("fetches efficient discovery pages while stopping evaluation exactly at the recommendation target", async () => {
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
    const harness = createHarness([], repository, {
      discoveryProvider,
      assembler: scenarioAssembler(new Map([[CHANNEL_A, 1], [CHANNEL_B, 0], [CHANNEL_C, 0], [CHANNEL_D, 0]])),
    });
    const result = await harness.pipeline.run(request(2));

    expect(discoveryCalls).toEqual([50, 50]);
    expect(result.statistics.discovered).toBe(3);
    expect(result.results).toHaveLength(3);
    expect(result.statistics).toMatchObject({ recommended: 2, recommendationsFilled: 2, stopReason: "target_reached" });
  });

  it("queues a full provider page and rotates to another category after ten evaluations", async () => {
    const repository = createRepository();
    const firstPageIds = "jklmnopqrstu".split("").map((letter) => `UC${letter.repeat(22)}`);
    const rotatedChannelId = `UC${"v".repeat(22)}`;
    const discoveryQueries: string[] = [];
    const discoveryProvider: YouTubeCandidateDiscoveryProvider = {
      discoverCandidates: async ({ query }) => {
        discoveryQueries.push(query);
        const ids = discoveryQueries.length === 1
          ? firstPageIds
          : discoveryQueries.length === 2
            ? [rotatedChannelId]
            : [];
        return {
          candidates: ids.map((channelId) => ({ ...candidate(channelId), sourceQuery: query })),
          nextPageToken: null,
          raw: { fixture: true },
        };
      },
    };
    const harness = createHarness([], repository, {
      discoveryProvider,
      discoveryStateRepository: new InMemoryDiscoveryStateRepository(),
    });

    const result = await harness.pipeline.run({
      runId: "category-fair-page-queue",
      discoveryMode: "automatic",
      targetRecommendedCount: 99,
      safetyLimits: { maxScannedCandidates: 13 },
      settings: defaultRecommendationSettings,
    });

    const identityOrder = harness.events
      .filter((event) => event.startsWith("identity:"))
      .map((event) => event.slice("identity:".length));
    expect(identityOrder.slice(0, 10)).toEqual(firstPageIds.slice(0, 10));
    expect(identityOrder[10]).toBe(rotatedChannelId);
    expect(new Set(discoveryQueries.slice(0, 2)).size).toBe(2);
    expect(result.statistics).toMatchObject({ discovered: 13, stopReason: "candidate_limit_reached" });
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

  it("fills a target of five after prior, same-run, hold, excluded, and failed candidates", async () => {
    const repository = createRepository();
    repository.addOrUpdate(historyRecordFor(CHANNEL_A));
    const candidates = [CHANNEL_A, CHANNEL_B, CHANNEL_B, CHANNEL_C, CHANNEL_D, CHANNEL_E, CHANNEL_F, CHANNEL_G, CHANNEL_H, CHANNEL_I];
    const assembler = scenarioAssembler(new Map([
      [CHANNEL_B, 1], [CHANNEL_C, 11],
      [CHANNEL_E, 0], [CHANNEL_F, 0], [CHANNEL_G, 0], [CHANNEL_H, 0], [CHANNEL_I, 0],
    ]));
    const harness = createHarness(candidates, repository, {
      assembler,
      evidenceFailureChannelId: CHANNEL_D,
    });
    const result = await harness.pipeline.run(request(5));

    expect(result.statistics).toEqual({
      discoveryMode: "manual_replace",
      queriesAttempted: 1,
      pagesScanned: 1,
      targetRecommendedCount: 5,
      recommendationsFilled: 5,
      discovered: 10,
      priorHistorySkipped: 1,
      historyReevaluated: 0,
      manualOverrideSkipped: 0,
      sameRunDuplicatesSkipped: 1,
      evaluated: 7,
      recommended: 5,
      hold: 1,
      excluded: 1,
      failed: 1,
      stopReason: "target_reached",
    });
    expect(result.results.filter((creator) => creator.decision === "recommended")).toHaveLength(5);
    expect(repository.load().map((record) => record.finalDecision).sort()).toEqual([
      "excluded", "hold", "recommended", "recommended", "recommended", "recommended", "recommended", "recommended",
    ]);
    expect(harness.calls.channelEvidence).toBe(8);
  });

  it("returns exactly the recommendation target without evaluating extra discovered identities", async () => {
    const repository = createRepository();
    const assembler = scenarioAssembler(new Map([[CHANNEL_A, 0], [CHANNEL_B, 0], [CHANNEL_C, 0]]));
    const harness = createHarness([CHANNEL_A, CHANNEL_B, CHANNEL_C], repository, { assembler });
    const result = await harness.pipeline.run(request(2));

    expect(result.statistics).toMatchObject({ discovered: 2, evaluated: 2, recommended: 2, stopReason: "target_reached" });
    expect(result.results).toHaveLength(2);
    expect(harness.calls.identity).toBe(2);
    expect(repository.load()).toHaveLength(2);
  });

  it("returns a partial source-exhausted result when the target cannot be filled", async () => {
    const repository = createRepository();
    const harness = createHarness([CHANNEL_A], repository);
    const result = await harness.pipeline.run(request(2));

    expect(result.statistics).toMatchObject({
      targetRecommendedCount: 2,
      recommendationsFilled: 0,
      hold: 1,
      stopReason: "source_exhausted",
    });
    expect(repository.load()).toHaveLength(1);
  });

  it("stops at the configured candidate scan limit", async () => {
    const repository = createRepository();
    const harness = createHarness([CHANNEL_A, CHANNEL_B, CHANNEL_C], repository);
    const result = await harness.pipeline.run(request(1, { maxScannedCandidates: 2 }));
    expect(result.statistics).toMatchObject({ discovered: 2, hold: 2, stopReason: "candidate_limit_reached" });
  });

  it("stops at the configured discovery page limit", async () => {
    const repository = createRepository();
    const harness = createHarness([CHANNEL_A, CHANNEL_B], repository);
    const result = await harness.pipeline.run(request(1, { maxDiscoveryPages: 1 }));
    expect(result.statistics).toMatchObject({ discovered: 2, hold: 2, stopReason: "page_limit_reached" });
  });

  it("stops before scheduling a candidate after the configured run duration", async () => {
    const repository = createRepository();
    let nowCalls = 0;
    const harness = createHarness([CHANNEL_A], repository, {
      now: () => new Date(NOW.getTime() + (nowCalls++ >= 2 ? 2 : 0)),
    });
    const result = await harness.pipeline.run(request(1, { maxRunDurationMs: 1 }));
    expect(result.statistics).toMatchObject({ discovered: 0, evaluated: 0, stopReason: "time_limit_reached" });
  });

  it("forces a partial result at the deadline and preserves only completed decisions", async () => {
    const repository = createRepository();
    const assembler = scenarioAssembler(new Map([[CHANNEL_A, 0], [CHANNEL_B, 0]]));
    const harness = createHarness([CHANNEL_A, CHANNEL_B], repository, {
      assembler,
      evidencePendingChannelId: CHANNEL_B,
    });

    const result = await harness.pipeline.run(request(2, { maxRunDurationMs: 20 }));

    expect(result.statistics).toMatchObject({
      discovered: 2,
      evaluated: 1,
      recommended: 1,
      recommendationsFilled: 1,
      failed: 0,
      stopReason: "time_limit_reached",
    });
    expect(result.results.map((creator) => creator.identity.youtubeChannelId)).toEqual([CHANNEL_A]);
    expect(repository.load().map((record) => record.identity.youtubeChannelId)).toEqual([CHANNEL_A]);
  });

  it("stops at the configured provider failure limit without creating history", async () => {
    const repository = createRepository();
    const harness = createHarness([CHANNEL_A, CHANNEL_B], repository, {
      evidenceFailureChannelIds: [CHANNEL_A, CHANNEL_B],
    });
    const result = await harness.pipeline.run(request(1, { maxProviderFailures: 1 }));
    expect(result.statistics).toMatchObject({ discovered: 1, failed: 1, recommended: 0, stopReason: "provider_failure_limit_reached" });
    expect(result.results).toEqual([]);
    expect(repository.load()).toEqual([]);
  });

  it("stops a run-wide discovery rate limit without exhausting every query", async () => {
    const repository = createRepository();
    let discoveryCalls = 0;
    const discoveryProvider: YouTubeCandidateDiscoveryProvider = {
      discoverCandidates: async () => {
        discoveryCalls += 1;
        throw new YouTubeProviderError("fictional rate limit", {
          category: "rate_limited",
          operation: "discover_candidates",
          retryable: true,
          status: 429,
        });
      },
    };
    const harness = createHarness([], repository, { discoveryProvider });

    const result = await harness.pipeline.run(request(3));

    expect(result.statistics).toMatchObject({
      recommendationsFilled: 0,
      failed: 1,
      stopReason: "provider_failure_limit_reached",
    });
    expect(result.failures).toEqual([
      expect.objectContaining({ stage: "discovery", category: "rate_limited", retryable: true }),
    ]);
    expect(discoveryCalls).toBe(1);
    expect(repository.load()).toEqual([]);
  });

  it("continues after normalization failure without counting or persisting the failed candidate", async () => {
    const repository = createRepository();
    const baseAssembler = scenarioAssembler(new Map([[CHANNEL_B, 0]]));
    const assembler: CreatorInputAssembler = (identity, evidence, context, recruitmentEvidence) => {
      if (identity.channelId === CHANNEL_A) throw new Error("fictional normalization failure");
      return baseAssembler(identity, evidence, context, recruitmentEvidence);
    };
    const harness = createHarness([CHANNEL_A, CHANNEL_B], repository, { assembler });
    const result = await harness.pipeline.run(request(1));

    expect(result.statistics).toMatchObject({ discovered: 2, evaluated: 1, recommended: 1, failed: 1, stopReason: "target_reached" });
    expect(result.results.map((creator) => creator.identity.youtubeChannelId)).toEqual([CHANNEL_B]);
    expect(repository.load()).toHaveLength(1);
  });

  it("continues after recommendation persistence failure and fills the target with a later candidate", async () => {
    const backingRepository = createRepository();
    const repository = failWritesFor(backingRepository, CHANNEL_A);
    const assembler = scenarioAssembler(new Map([[CHANNEL_A, 0], [CHANNEL_B, 0]]));
    const harness = createHarness([CHANNEL_A, CHANNEL_B], repository, { assembler });
    const result = await harness.pipeline.run(request(1));

    expect(result.statistics).toMatchObject({ discovered: 2, evaluated: 2, recommended: 1, recommendationsFilled: 1, failed: 1, stopReason: "target_reached" });
    expect(result.results.map((creator) => creator.identity.youtubeChannelId)).toEqual([CHANNEL_B]);
    expect(backingRepository.load().map((record) => record.identity.youtubeChannelId)).toEqual([CHANNEL_B]);
  });

  it("learns safe discovery phrases from recommended and score-qualified hold creators", async () => {
    const repository = createRepository();
    const discoveryState = new InMemoryDiscoveryStateRepository();
    const recruitmentProvider: RecruitmentEvidenceProvider = {
      collectEvidence: async () => ({
        normalized: { ...fictionalRecruitmentEvidence(), exploratoryDiscoveryPhrases: ["직장인 뷰티 루틴"] },
        raw: { fixture: true },
      }),
    };
    const recommended = createHarness([CHANNEL_A], repository, {
      assembler: scenarioAssembler(new Map([[CHANNEL_A, 0]])), recruitmentProvider, discoveryStateRepository: discoveryState,
    });
    await recommended.pipeline.run(request(1));
    expect(discoveryState.listLearnedTerms()).toHaveLength(1);

    const holdState = new InMemoryDiscoveryStateRepository();
    const hold = createHarness([CHANNEL_B], createRepository(), {
      assembler: scenarioAssembler(new Map([[CHANNEL_B, 1]])), recruitmentProvider, discoveryStateRepository: holdState,
    });
    const holdResult = await hold.pipeline.run(request(1));
    expect(holdResult.results[0]).toMatchObject({ decision: "hold" });
    expect(holdResult.results[0].fitScore).toBeGreaterThanOrEqual(defaultRecommendationSettings.recommendationScoreThreshold);
    expect(holdState.listLearnedTerms()).toHaveLength(1);
  });

  it("continues across automatically selected queries with category-fair discovery turns", async () => {
    const repository = createRepository();
    const discoveryState = new InMemoryDiscoveryStateRepository();
    const ids = [CHANNEL_A, CHANNEL_B];
    const calls: Array<{ query: string; maxResults: number }> = [];
    const discoveryProvider: YouTubeCandidateDiscoveryProvider = {
      discoverCandidates: async ({ query, maxResults }) => {
        calls.push({ query, maxResults });
        const channelId = ids[calls.length - 1];
        return { candidates: channelId ? [{ ...candidate(channelId), sourceQuery: query }] : [], nextPageToken: null, raw: {} };
      },
    };
    const harness = createHarness([], repository, {
      discoveryProvider, discoveryStateRepository: discoveryState,
      assembler: scenarioAssembler(new Map([[CHANNEL_A, 0], [CHANNEL_B, 0]])),
    });
    const result = await harness.pipeline.run({
      runId: "h43-auto-multi-query", discoveryMode: "automatic", targetRecommendedCount: 2,
      settings: defaultRecommendationSettings,
    });
    expect(result.statistics).toMatchObject({ discoveryMode: "automatic", queriesAttempted: 2, pagesScanned: 2, recommended: 2, stopReason: "target_reached" });
    expect(calls.map((call) => call.maxResults)).toEqual([50, 50]);
    expect(new Set(calls.map((call) => call.query)).size).toBe(2);
  });
});

function createRepository(): SqliteHistoryRepository {
  const database = openDatabase(":memory:");
  databases.push(database);
  return new SqliteHistoryRepository(database);
}

function request(targetRecommendedCount: number, safetyLimits: Partial<AutomaticScoutingSafetyLimits> = {}) {
  return {
    runId: "h4-fictional-run",
    query: "허구 목 검색어",
    category: "뷰티",
    targetRecommendedCount,
    recentVideoLimit: 5,
    safetyLimits,
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
  evidenceFailureChannelIds?: string[];
  evidencePendingChannelId?: string;
  discoveryProvider?: YouTubeCandidateDiscoveryProvider;
  recruitmentProvider?: RecruitmentEvidenceProvider;
  now?: () => Date;
  discoveryStateRepository?: DiscoveryStateRepository;
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
      if (identity.channelId === options.evidencePendingChannelId) {
        return await new Promise<never>(() => undefined);
      }
      if (identity.channelId === options.evidenceFailureChannelId || options.evidenceFailureChannelIds?.includes(identity.channelId)) {
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
    discoverCandidates: async ({ maxResults, pageToken }) => {
      const start = pageToken ? Number(pageToken) : 0;
      const pageIds = candidateIds.slice(start, start + maxResults);
      const nextIndex = start + pageIds.length;
      return {
        candidates: pageIds.map(candidate),
        nextPageToken: nextIndex < candidateIds.length ? String(nextIndex) : null,
        raw: { fixture: true },
      };
    },
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
      ...(options.discoveryStateRepository ? { discoveryStateRepository: options.discoveryStateRepository } : {}),
      ...(options.useDefaultAssembler ? {} : { assembleCreatorInput: assembler }),
      now: options.now ?? (() => NOW),
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
    categoryEvidence: {
      verifiedCategory: "뷰티",
      verificationState: "confirmed" as const,
      companyChannelConfirmed: null,
      scores: { 뷰티: 12 },
      matchedSignals: ["채널 설명: 뷰티"],
      verifiedAt: NOW.toISOString(),
      sources: [source],
    },
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
