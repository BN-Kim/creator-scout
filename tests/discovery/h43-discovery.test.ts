import { afterEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import { defaultRecommendationSettings } from "@/config/recommendation-rules";
import { openDatabase } from "@/server/database/database";
import { AdaptiveQuerySelector } from "@/server/discovery/adaptive-query-selector";
import { generateTaxonomyQueries, isSafeDiscoveryQuery } from "@/server/discovery/discovery-taxonomy";
import { extractSafeDiscoveryPhrases } from "@/server/discovery/learned-phrase-extractor";
import { scoreDiscoveryQuery } from "@/server/discovery/query-quality";
import { SqliteDiscoveryStateRepository } from "@/server/discovery/sqlite-discovery-state-repository";
import { SqliteHistoryRepository } from "@/server/history/sqlite-history-repository";
import { AutomaticScoutingPipeline, maximumCandidatesPerDiscoveryPage } from "@/server/scouting/automatic-scouting-pipeline";

const NOW = new Date("2026-07-22T10:00:00.000Z");
const databases: Database.Database[] = [];

afterEach(() => {
  for (const database of databases.splice(0)) database.close();
});

describe("H4.3 autonomous discovery", () => {
  it("generates deterministic, non-empty Korean taxonomy queries without identifiers or prohibited terms", () => {
    const first = generateTaxonomyQueries();
    const second = generateTaxonomyQueries();
    expect(first).toEqual(second);
    expect(first.length).toBeGreaterThan(20);
    expect(new Set(first.map((query) => query.category)).size).toBeGreaterThan(4);
    expect(new Set(first.map((query) => query.scope))).toEqual(new Set(["narrow", "medium", "broad"]));
    expect(first.every((query) => isSafeDiscoveryQuery(query.query))).toBe(true);
    expect(first.every((query) => /[가-힣]/.test(query.query))).toBe(true);
    expect(first.some((query) => !query.query.trim())).toBe(false);
  });

  it("runs automatic discovery with only a recommendation target and never sends an empty query", async () => {
    const { database, discovery, history } = repositories();
    const queries: string[] = [];
    const pipeline = new AutomaticScoutingPipeline({
      discoveryProvider: { discoverCandidates: async ({ query }) => { queries.push(query); return { candidates: [], nextPageToken: null, raw: {} }; } },
      identityProvider: { resolveIdentity: async () => { throw new Error("should not resolve"); } },
      evidenceProvider: {
        getChannelEvidence: async () => { throw new Error("should not collect"); },
        getRecentVideoEvidence: async () => { throw new Error("should not collect"); },
      },
      historyRepository: history,
      discoveryStateRepository: discovery,
      now: () => NOW,
    });
    const result = await pipeline.run({ runId: "h43-auto-only-target", targetRecommendedCount: 1, settings: defaultRecommendationSettings });
    expect(result.statistics).toMatchObject({ discoveryMode: "automatic", stopReason: "source_exhausted", discovered: 0 });
    expect(queries.length).toBeGreaterThan(1);
    expect(queries.every((query) => query.trim().length > 0)).toBe(true);
    expect(discovery.listQueries().every((state) => state.exhausted)).toBe(true);
    expect(database.prepare("SELECT COUNT(*) AS count FROM history_records").get()).toEqual({ count: 0 });
  });

  it("caps each query turn and rotates categories before one high-volume query can dominate", async () => {
    const { discovery, history } = repositories();
    const requests: Array<{ query: string; maxResults: number }> = [];
    const pipeline = new AutomaticScoutingPipeline({
      discoveryProvider: {
        discoverCandidates: async ({ query, maxResults }) => {
          requests.push({ query, maxResults });
          return { candidates: [], nextPageToken: null, raw: {} };
        },
      },
      identityProvider: { resolveIdentity: async () => { throw new Error("should not resolve"); } },
      evidenceProvider: {
        getChannelEvidence: async () => { throw new Error("should not collect"); },
        getRecentVideoEvidence: async () => { throw new Error("should not collect"); },
      },
      historyRepository: history,
      discoveryStateRepository: discovery,
      now: () => NOW,
    });

    await pipeline.run({ runId: "h43-fair-query-turns", targetRecommendedCount: 1, settings: defaultRecommendationSettings });

    const categoryByQuery = new Map(generateTaxonomyQueries().map((query) => [query.query, query.category]));
    expect(requests.every((request) => request.maxResults <= maximumCandidatesPerDiscoveryPage)).toBe(true);
    expect(new Set(requests.slice(0, 6).map((request) => categoryByQuery.get(request.query))).size).toBe(6);
  });

  it("supports manual replacement and extension without duplicating normalized queries", () => {
    const { discovery } = repositories();
    const replace = new AdaptiveQuerySelector(discovery, { mode: "manual_replace", manualQueries: ["  한국 뷰티 리뷰  ", "한국  뷰티 리뷰"] }, () => NOW);
    replace.initialize();
    expect(discovery.listQueries()).toHaveLength(1);
    expect(discovery.listQueries()[0]).toMatchObject({ origin: "manual", query: "한국 뷰티 리뷰" });

    const { discovery: extended } = repositories();
    const extend = new AdaptiveQuerySelector(extended, { mode: "manual_extend", manualQueries: ["한국 푸드 브이로그"] }, () => NOW);
    extend.initialize();
    expect(new Set(extended.listQueries().map((query) => query.origin))).toEqual(new Set(["taxonomy", "manual"]));
  });

  it("manual replacement can reuse a normalized query previously stored by automatic mode", () => {
    const { discovery } = repositories();
    const automatic = new AdaptiveQuerySelector(discovery, { mode: "automatic", manualQueries: [] }, () => NOW);
    automatic.initialize();
    const existing = discovery.listQueries().find((query) => query.origin === "taxonomy");
    expect(existing).toBeDefined();
    const manual = new AdaptiveQuerySelector(discovery, { mode: "manual_replace", manualQueries: [existing!.query] }, () => NOW);
    manual.initialize();
    expect(manual.next(0)?.normalizedKey).toBe(existing!.normalizedKey);
  });

  it("rotates categories and starts narrow before broader query scopes", () => {
    const { discovery } = repositories();
    const selector = new AdaptiveQuerySelector(discovery, { mode: "automatic", manualQueries: [] }, () => NOW);
    selector.initialize();
    const first = selector.next(0);
    const second = selector.next(0);
    expect(first?.scope).toBe("narrow");
    expect(second?.scope).toBe("narrow");
    expect(second?.category).not.toBe(first?.category);
  });

  it("restricts automatic taxonomy and learned queries to the user-selected category", () => {
    const { discovery } = repositories();
    discovery.ensureQueries(generateTaxonomyQueries(), NOW.toISOString());
    discovery.upsertLearnedTerms(
      ["푸드 레시피 직장인"],
      "푸드",
      {
        channelId: `UC${"f".repeat(22)}`,
        publicUrl: `https://www.youtube.com/channel/UC${"f".repeat(22)}`,
        evidence: ["채널 설명: 레시피"],
      },
      NOW.toISOString(),
    );
    discovery.upsertLearnedTerms(
      ["라이프스타일 일상 직장인"],
      "라이프스타일",
      {
        channelId: `UC${"l".repeat(22)}`,
        publicUrl: `https://www.youtube.com/channel/UC${"l".repeat(22)}`,
        evidence: ["채널 설명: 일상"],
      },
      NOW.toISOString(),
    );
    const selector = new AdaptiveQuerySelector(
      discovery,
      { mode: "automatic", manualQueries: [], preferredCategory: "푸드" },
      () => NOW,
    );
    selector.initialize();

    const selected = Array.from({ length: 8 }, () => selector.next(0)).filter((query) => query !== null);
    expect(selected.length).toBeGreaterThan(0);
    expect(selected.every((query) => query.category === "푸드")).toBe(true);
    expect(discovery.listQueries().some((query) => query.category === "라이프스타일")).toBe(true);
  });

  it("keeps manual extension inside the user-selected category", () => {
    const { discovery } = repositories();
    const selector = new AdaptiveQuerySelector(
      discovery,
      {
        mode: "manual_extend",
        manualQueries: ["직장인 간편 도시락", "라이프스타일 일상 브이로그"],
        preferredCategory: "푸드",
      },
      () => NOW,
    );
    selector.initialize();

    const states = discovery.listQueries();
    expect(states.some((query) => query.query === "직장인 간편 도시락" && query.category === "푸드")).toBe(true);
    expect(states.some((query) => query.category === "라이프스타일")).toBe(false);
    expect(states.every((query) => query.category === "푸드")).toBe(true);
  });

  it("persists continuation and query counters for a reconstructed repository", () => {
    const { database, discovery } = repositories();
    const query = generateTaxonomyQueries(["narrow"])[0];
    discovery.ensureQueries([query], NOW.toISOString());
    discovery.recordPage(query.normalizedKey, "fictional-next-page", false, {
      candidatesScanned: 7, newIdentities: 5, duplicates: 2, recommended: 1, hold: 2, excluded: 1, failed: 1,
    }, NOW.toISOString());
    const reconstructed = new SqliteDiscoveryStateRepository(database);
    expect(reconstructed.listQueries()[0]).toMatchObject({
      continuationToken: "fictional-next-page", attempts: 1, pagesScanned: 1, candidatesScanned: 7,
      newIdentities: 5, duplicates: 2, recommended: 1, hold: 2, excluded: 1, failed: 1, exhausted: false,
    });
  });

  it("uses a minimum sample before a high-performing query is proven", () => {
    const state = stateFixture({ candidatesScanned: 2, newIdentities: 2, recommended: 2 });
    expect(scoreDiscoveryQuery(state).proven).toBe(false);
    expect(scoreDiscoveryQuery({ ...state, candidatesScanned: 20, newIdentities: 16, recommended: 8 }).proven).toBe(true);
    expect(scoreDiscoveryQuery({ ...state, candidatesScanned: 20, duplicates: 18, failed: 2, recommended: 0 }).score)
      .toBeLessThan(scoreDiscoveryQuery({ ...state, candidatesScanned: 20, newIdentities: 16, recommended: 8 }).score);
  });

  it("learns only safe exploratory phrases and removes creator identifiers and contact data", () => {
    const phrases = extractSafeDiscoveryPhrases([
      "오늘은 직장인 뷰티 루틴과 스킨케어 리뷰를 소개합니다 creator@example.com https://example.invalid",
      "@fictionalCreator 주말 메이크업 튜토리얼",
    ], "가상 크리에이터", "뷰티");
    expect(phrases).toEqual(expect.arrayContaining([expect.stringContaining("뷰티") as string]));
    expect(phrases.join(" ")).not.toContain("example");
    expect(phrases.join(" ")).not.toContain("가상 크리에이터");
    expect(phrases.every(isSafeDiscoveryQuery)).toBe(true);
    expect(extractSafeDiscoveryPhrases(["당했다 성수 브이로그"], "가상 푸드 채널", "푸드")).toEqual([]);
  });

  it("keeps learned terms exploratory until sampled, then proves or cools them by performance", () => {
    const { discovery } = repositories();
    const source = {
      channelId: `UC${"s".repeat(22)}`,
      publicUrl: `https://www.youtube.com/channel/UC${"s".repeat(22)}`,
      evidence: ["채널 설명: 뷰티"],
    };
    discovery.upsertLearnedTerms(["직장인 뷰티 루틴", "여행 브이로그 주말"], "뷰티", source, NOW.toISOString());
    const terms = discovery.listLearnedTerms();
    expect(terms.every((term) => term.state === "exploratory" && term.sampleCount === 0)).toBe(true);
    expect(terms[0]).toMatchObject({
      sourceChannelId: source.channelId,
      sourcePublicUrl: source.publicUrl,
      sourceEvidence: source.evidence,
    });
    discovery.recordLearnedTermOutcome("직장인 뷰티 루틴", { candidatesScanned: 10, recommended: 3, newIdentities: 9 }, NOW.toISOString());
    discovery.recordLearnedTermOutcome("여행 브이로그 주말", { candidatesScanned: 10, duplicates: 8, failed: 1 }, NOW.toISOString());
    expect(discovery.listLearnedTerms().find((term) => term.normalizedKey === "직장인 뷰티 루틴")?.state).toBe("proven");
    expect(discovery.listLearnedTerms().find((term) => term.normalizedKey === "여행 브이로그 주말")?.state).toBe("cooldown");
  });

  it("reactivates an exhausted query only after its persisted cooldown expires", () => {
    const { discovery } = repositories();
    const query = { query: "한국 뷰티 리뷰", normalizedKey: "한국 뷰티 리뷰", category: "뷰티", scope: "narrow" as const, origin: "manual" as const };
    discovery.ensureQueries([query], "2026-07-01T00:00:00.000Z");
    discovery.setCooldown(query.normalizedKey, "2026-07-21T00:00:00.000Z", true, "2026-07-14T00:00:00.000Z");
    const selector = new AdaptiveQuerySelector(discovery, { mode: "manual_replace", manualQueries: [query.query] }, () => NOW);
    selector.initialize();
    expect(selector.next(0)).toMatchObject({ normalizedKey: query.normalizedKey, exhausted: false, cooldownUntil: null });
  });

  it("rotates deterministically between proven, under-sampled, and new queries", () => {
    const { discovery } = repositories();
    const definitions = [
      { query: "뷰티 리뷰 한국", normalizedKey: "뷰티 리뷰 한국", category: "뷰티", scope: "narrow" as const, origin: "manual" as const },
      { query: "푸드 리뷰 한국", normalizedKey: "푸드 리뷰 한국", category: "푸드", scope: "narrow" as const, origin: "manual" as const },
      { query: "여행 리뷰 한국", normalizedKey: "여행 리뷰 한국", category: "여행", scope: "narrow" as const, origin: "manual" as const },
    ];
    discovery.ensureQueries(definitions, NOW.toISOString());
    discovery.recordPage(definitions[0].normalizedKey, "p2", false, { candidatesScanned: 10, recommended: 3 }, NOW.toISOString());
    discovery.recordPage(definitions[1].normalizedKey, "p2", false, { candidatesScanned: 2 }, NOW.toISOString());
    const selector = new AdaptiveQuerySelector(discovery, { mode: "manual_replace", manualQueries: definitions.map((query) => query.query) }, () => NOW);
    selector.initialize();
    expect([selector.next(0)?.normalizedKey, selector.next(0)?.normalizedKey, selector.next(0)?.normalizedKey]).toEqual([
      definitions[0].normalizedKey, definitions[1].normalizedKey, definitions[2].normalizedKey,
    ]);
  });
});

function repositories(): { database: Database.Database; discovery: SqliteDiscoveryStateRepository; history: SqliteHistoryRepository } {
  const database = openDatabase(":memory:");
  databases.push(database);
  return { database, discovery: new SqliteDiscoveryStateRepository(database), history: new SqliteHistoryRepository(database) };
}

function stateFixture(patch: Partial<ReturnType<SqliteDiscoveryStateRepository["listQueries"]>[number]>) {
  return {
    query: "한국 뷰티 리뷰", normalizedKey: "한국 뷰티 리뷰", category: "뷰티", scope: "narrow" as const,
    origin: "taxonomy" as const, continuationToken: null, attempts: 0, pagesScanned: 0, candidatesScanned: 0,
    newIdentities: 0, duplicates: 0, recommended: 0, hold: 0, excluded: 0, failed: 0, categoryMatches: 0,
    koreanActivityMatches: 0, personalContacts: 0, lastAttemptedAt: null, cooldownUntil: null, exhausted: false,
    createdAt: NOW.toISOString(), updatedAt: NOW.toISOString(), ...patch,
  };
}
