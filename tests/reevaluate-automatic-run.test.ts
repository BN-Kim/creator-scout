import { afterEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import { openDatabase } from "@/server/database/database";
import { defaultRecommendationSettings, legacyRecommendationRuleVersion, recommendationRuleVersion } from "@/config/recommendation-rules";
import { mockCreatorInputs } from "@/data/creators";
import { createHistoryRecord } from "@/server/history/history-record";
import { SqliteHistoryRepository } from "@/server/history/sqlite-history-repository";
import { evaluateCreator } from "@/server/rules/evaluate-creator";
import { reevaluateAutomaticRun } from "@/server/scouting/reevaluate-automatic-run";
import { SqliteAutomaticRunResultRepository } from "@/server/scouting/sqlite-automatic-run-result-repository";
import type { AutomaticScoutingRunResult } from "@/server/scouting/automatic-scouting-types";
import type { CreatorInput, EvaluatedCreator } from "@/types/domain";

const databases: Database.Database[] = [];
const NOW = new Date("2026-08-02T03:00:00.000Z");

afterEach(() => {
  for (const database of databases.splice(0)) database.close();
});

describe("stored automatic run reevaluation", () => {
  it("replays stored evidence, preserves manual decisions, and spends no discovery quota", () => {
    const database = openDatabase(":memory:");
    databases.push(database);
    const history = new SqliteHistoryRepository(database);
    const runs = new SqliteAutomaticRunResultRepository(database);
    const inactiveWithoutContact = legacyCreator({
      ...mockCreatorInputs[7],
      evidence: {
        ...mockCreatorInputs[7].evidence,
        visibleEmail: null,
        emailClassification: "not_found",
        emailVerificationState: "not_checked",
      },
    }, "excluded");
    const organizationEmail = legacyCreator(mockCreatorInputs[15], "excluded");
    const manuallyHeld = legacyCreator(mockCreatorInputs[0], "recommended");
    history.addOrUpdate(createHistoryRecord({
      ...manuallyHeld,
      decision: "hold",
      decisionSource: "manual",
      koreanExplanation: "마케터가 캠페인 맥락을 검토하기 위해 보류했습니다.",
    }, "automatic-legacy-source"));
    runs.save(sourceRun([inactiveWithoutContact, organizationEmail, manuallyHeld]));

    const result = reevaluateAutomaticRun(
      { sourceRunId: "automatic-legacy-source" },
      { historyRepository: history, runRepository: runs, now: () => NOW, createId: () => "fixed" },
    );

    expect(result.runId).toBe("automatic-reevaluation-fixed");
    expect(result.runKind).toBe("reevaluation");
    expect(result.sourceRunId).toBe("automatic-legacy-source");
    expect(result.statistics.discovered).toBe(0);
    expect(result.statistics.pagesScanned).toBe(0);
    expect(result.statistics.historyReevaluated).toBe(2);
    expect(result.statistics.manualOverrideSkipped).toBe(1);
    expect(result.requestSnapshot?.ruleVersion).toBe(recommendationRuleVersion);
    expect(result.results[0].decision).toBe("hold");
    expect(result.results[0].reasonCodes).toContain("latest_upload_too_old");
    expect(result.results[0].recheckAt).not.toBeNull();
    expect(result.results[1].decision).toBe("excluded");
    expect(result.results[1].reasonCodes).toContain("company_email");
    expect(result.results[2].decision).toBe("hold");
    expect(result.results[2].decisionSource).toBe("manual");
    expect(result.results[2].koreanExplanation).toContain("마케터가");
    expect(runs.get(result.runId)).toEqual(result);
    expect(history.findDuplicate(inactiveWithoutContact.identity)?.scoutingRunId).toBe(result.runId);
    expect(history.findDuplicate(manuallyHeld.identity)?.scoutingRunId).toBe("automatic-legacy-source");
  });
});

function legacyCreator(input: CreatorInput, decision: EvaluatedCreator["decision"]): EvaluatedCreator {
  const evaluation = evaluateCreator(input, defaultRecommendationSettings, [], [], NOW);
  return {
    ...input,
    ...evaluation,
    decision,
    ruleVersion: legacyRecommendationRuleVersion,
    fitScore: null,
    scoreComponents: null,
    appliedSettings: null,
    recheckAt: null,
  };
}

function sourceRun(results: EvaluatedCreator[]): AutomaticScoutingRunResult {
  return {
    runId: "automatic-legacy-source",
    runKind: "discovery",
    sourceRunId: null,
    status: "completed",
    startedAt: "2026-07-28T00:00:00.000Z",
    completedAt: "2026-07-28T00:01:00.000Z",
    statistics: {
      discoveryMode: "automatic",
      queriesAttempted: 1,
      pagesScanned: 1,
      targetRecommendedCount: 5,
      recommendationsFilled: 1,
      discovered: results.length,
      priorHistorySkipped: 0,
      historyReevaluated: 0,
      manualOverrideSkipped: 0,
      sameRunDuplicatesSkipped: 0,
      evaluated: results.length,
      recommended: 1,
      hold: 0,
      excluded: 2,
      failed: 0,
      stopReason: "source_exhausted",
    },
    results,
    skips: [],
    failures: [],
    requestSnapshot: null,
    diagnostics: {
      funnel: { evaluated: 3, staticEligible: 2, scoreQualified: 0, contactReady: 3, recommended: 1, hold: 0, excluded: 2 },
      querySequence: [],
      byCategory: {},
      byQuery: {},
    },
  };
}
