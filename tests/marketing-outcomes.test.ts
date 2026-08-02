import { afterEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import { defaultRecommendationSettings } from "@/config/recommendation-rules";
import { openDatabase } from "@/server/database/database";
import { buildMarketingDiagnosticsReport } from "@/server/marketing/marketing-diagnostics";
import { SqliteMarketingOutcomeRepository } from "@/server/marketing/sqlite-marketing-outcome-repository";
import type { AutomaticScoutingRunResult } from "@/server/scouting/automatic-scouting-types";
import type { MarketingOutcomeEvent } from "@/types/domain";

const databases: Database.Database[] = [];

afterEach(() => {
  for (const database of databases.splice(0)) database.close();
});

describe("marketing outcomes and diagnostics", () => {
  it("stores funnel stages and campaign performance metrics against history", () => {
    const database = openDatabase(":memory:");
    databases.push(database);
    seedHistory(database);
    const repository = new SqliteMarketingOutcomeRepository(database);
    const approved = outcome("approved", "marketer_approved");
    const performance = { ...outcome("performance", "campaign_performance"), views: 12_000, conversions: 14, revenueKrw: 480_000 };

    repository.add(approved);
    repository.add(performance);

    expect(repository.list({ historyRecordId: "history-fixture" })).toEqual([performance, approved]);
  });

  it("aggregates rule, category, query, manual-decision, and outcome funnels", () => {
    const approved = outcome("approved", "marketer_approved");
    const performance = { ...outcome("performance", "campaign_performance"), views: 12_000, conversions: 14, revenueKrw: 480_000 };
    const report = buildMarketingDiagnosticsReport(
      [runFixture()],
      [approved, performance],
      2,
      "2026-08-02T08:00:00.000Z",
    );

    expect(report).toMatchObject({ runCount: 1, discoveryRunCount: 1, reevaluationRunCount: 0, manualDecisionCount: 2 });
    expect(report.byRuleVersion["fixture-rule"]).toMatchObject({ evaluated: 5, recommended: 2, hold: 2, excluded: 1 });
    expect(report.byCategory["푸드"].contactReady).toBe(2);
    expect(report.byQuery["푸드 레시피"].scoreQualified).toBe(3);
    expect(report.outcomeFunnel.marketer_approved).toEqual({ events: 1, creators: 1 });
    expect(report.campaignTotals).toMatchObject({ views: 12_000, conversions: 14, revenueKrw: 480_000 });
  });
});

function seedHistory(database: Database.Database): void {
  database.prepare(`INSERT INTO history_records (
    id, identity_json, history_status, final_decision, category, reason_codes_json,
    korean_explanation, evidence_summary, scouting_run_id, created_at, updated_at,
    manual_correction_json, fit_score, score_components_json, contact_ready,
    rule_version, recheck_at, applied_settings_json, decision_source
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    "history-fixture",
    JSON.stringify({ internalId: "creator-fixture", channelName: "허구 채널", normalizedChannelName: "허구 채널", confirmedAliases: [], canonicalChannelUrl: null, youtubeChannelId: null, youtubeHandle: null, sourceUrls: [], category: "푸드", identityVerificationState: "confirmed" }),
    "recommended", "recommended", "푸드", "[]", "허구", "허구", "automatic-fixture",
    "2026-08-01T00:00:00.000Z", "2026-08-01T00:00:00.000Z", null, 80, null, 1, "fixture-rule", null, null, "system",
  );
}

function outcome(id: string, outcomeType: MarketingOutcomeEvent["outcomeType"]): MarketingOutcomeEvent {
  return {
    id: `marketing-outcome-${id}`,
    historyRecordId: "history-fixture",
    runId: "automatic-fixture",
    outcomeType,
    occurredAt: id === "performance" ? "2026-08-02T02:00:00.000Z" : "2026-08-01T02:00:00.000Z",
    note: "허구 성과",
    contentUrl: null,
    views: null,
    likes: null,
    comments: null,
    conversions: null,
    revenueKrw: null,
    createdAt: "2026-08-02T03:00:00.000Z",
  };
}

function runFixture(): AutomaticScoutingRunResult {
  const breakdown = { evaluated: 5, staticEligible: 4, scoreQualified: 3, contactReady: 2, recommended: 2, hold: 2, excluded: 1 };
  return {
    runId: "automatic-fixture", runKind: "discovery", sourceRunId: null, status: "completed",
    startedAt: "2026-08-01T00:00:00.000Z", completedAt: "2026-08-01T00:01:00.000Z",
    statistics: {
      discoveryMode: "automatic", queriesAttempted: 1, pagesScanned: 1, targetRecommendedCount: 5,
      recommendationsFilled: 2, discovered: 5, priorHistorySkipped: 0, historyReevaluated: 0,
      manualOverrideSkipped: 0, sameRunDuplicatesSkipped: 0, evaluated: 5, recommended: 2,
      hold: 2, excluded: 1, failed: 0, stopReason: "source_exhausted",
    },
    results: [], skips: [], failures: [],
    requestSnapshot: {
      discoveryMode: "automatic", manualQueries: [], preferredCategory: "푸드", targetRecommendedCount: 5,
      recentVideoLimit: null, safetyLimits: { maxScannedCandidates: 100, maxDiscoveryPages: 10, maxRunDurationMs: 60_000, maxProviderFailures: 10 },
      settings: defaultRecommendationSettings,
      ruleVersion: "fixture-rule",
    },
    diagnostics: { funnel: breakdown, querySequence: [], byCategory: { 푸드: breakdown }, byQuery: { "푸드 레시피": breakdown } },
  };
}
