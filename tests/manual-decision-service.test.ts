import { afterEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import { defaultRecommendationSettings } from "@/config/recommendation-rules";
import { mockCreatorInputs } from "@/data/creators";
import { openDatabase } from "@/server/database/database";
import { createHistoryRecord } from "@/server/history/history-record";
import { SqliteDecisionAuditRepository } from "@/server/history/sqlite-decision-audit-repository";
import { SqliteHistoryRepository } from "@/server/history/sqlite-history-repository";
import { evaluateCreator } from "@/server/rules/evaluate-creator";
import { applyManualDecision, ManualDecisionError } from "@/server/scouting/manual-decision-service";
import { SqliteAutomaticRunResultRepository } from "@/server/scouting/sqlite-automatic-run-result-repository";
import type { AutomaticScoutingRunResult } from "@/server/scouting/automatic-scouting-types";
import type { CreatorInput, EvaluatedCreator } from "@/types/domain";

const NOW = new Date("2026-08-02T06:00:00.000Z");
const databases: Database.Database[] = [];

afterEach(() => {
  for (const database of databases.splice(0)) database.close();
});

describe("manual creator decisions", () => {
  it("updates run and history, persists audit events, and protects the decision from system rewrites", () => {
    const context = createContext();
    const contactReady = evaluated(mockCreatorInputs[0]);
    context.history.addOrUpdate(createHistoryRecord(contactReady, "automatic-manual-source"));
    context.runs.save(runFixture([contactReady]));

    const demoted = applyManualDecision({
      runId: "automatic-manual-source",
      creatorInternalId: contactReady.identity.internalId,
      decision: "hold",
      reason: "campaign_mismatch",
      note: "이번 캠페인 메시지와 맞지 않음",
    }, context.dependencies);

    expect(demoted.creator).toMatchObject({ decision: "hold", decisionSource: "manual", recheckAt: null });
    expect(demoted.creator.reasonCodes).toContain("manual_decision_override");
    expect(demoted.run.statistics).toMatchObject({ recommended: 0, hold: 1, excluded: 0 });
    expect(context.history.findDuplicate(contactReady.identity)).toMatchObject({ finalDecision: "hold", decisionSource: "manual" });
    const manualHistory = context.history.findDuplicate(contactReady.identity)!;
    context.history.addOrUpdate({
      ...manualHistory,
      finalDecision: "recommended",
      historyStatus: "recommended",
      decisionSource: "system",
      updatedAt: "2026-08-03T00:00:00.000Z",
    });
    expect(context.history.findDuplicate(contactReady.identity)?.finalDecision).toBe("hold");

    const promoted = applyManualDecision({
      runId: "automatic-manual-source",
      creatorInternalId: contactReady.identity.internalId,
      decision: "recommended",
      reason: "contact_verified",
      note: "개인 연락처와 캠페인 적합성 재확인",
    }, context.dependencies);
    expect(promoted.creator.decision).toBe("recommended");
    expect(context.audits.list({ runId: "automatic-manual-source" }).map((audit) => audit.nextDecision)).toEqual(["recommended", "hold"]);
    expect(context.runs.get("automatic-manual-source")?.results[0].decisionSource).toBe("manual");
  });

  it("cannot promote a permanent hard exclusion or a creator without confirmed personal contact", () => {
    const context = createContext();
    const organizationEmail = evaluated(mockCreatorInputs[15]);
    const noContact = evaluated(mockCreatorInputs[1]);
    for (const creator of [organizationEmail, noContact]) {
      context.history.addOrUpdate(createHistoryRecord(creator, "automatic-manual-source"));
    }
    context.runs.save(runFixture([organizationEmail, noContact]));

    expect(() => applyManualDecision({
      runId: "automatic-manual-source",
      creatorInternalId: organizationEmail.identity.internalId,
      decision: "hold",
      reason: "marketer_fit",
      note: "",
    }, context.dependencies)).toThrowError(expect.objectContaining({ reason: "hard_exclusion_locked" }) as ManualDecisionError);
    expect(() => applyManualDecision({
      runId: "automatic-manual-source",
      creatorInternalId: noContact.identity.internalId,
      decision: "recommended",
      reason: "marketer_fit",
      note: "",
    }, context.dependencies)).toThrowError(expect.objectContaining({ reason: "contact_not_ready" }) as ManualDecisionError);
    expect(context.audits.list()).toEqual([]);
  });
});

function createContext() {
  const database = openDatabase(":memory:");
  databases.push(database);
  const history = new SqliteHistoryRepository(database);
  const runs = new SqliteAutomaticRunResultRepository(database);
  const audits = new SqliteDecisionAuditRepository(database);
  let id = 0;
  return {
    history,
    runs,
    audits,
    dependencies: { historyRepository: history, runRepository: runs, auditRepository: audits, now: () => NOW, createId: () => `fixed-${++id}` },
  };
}

function evaluated(input: CreatorInput): EvaluatedCreator {
  return { ...input, ...evaluateCreator(input, defaultRecommendationSettings, [], [], NOW) };
}

function runFixture(results: EvaluatedCreator[]): AutomaticScoutingRunResult {
  const recommended = results.filter((creator) => creator.decision === "recommended").length;
  const hold = results.filter((creator) => creator.decision === "hold").length;
  const excluded = results.filter((creator) => creator.decision === "excluded").length;
  return {
    runId: "automatic-manual-source",
    runKind: "discovery",
    sourceRunId: null,
    status: "completed",
    startedAt: NOW.toISOString(),
    completedAt: NOW.toISOString(),
    statistics: {
      discoveryMode: "automatic", queriesAttempted: 1, pagesScanned: 1, targetRecommendedCount: 5,
      recommendationsFilled: recommended, discovered: results.length, priorHistorySkipped: 0,
      historyReevaluated: 0, manualOverrideSkipped: 0, sameRunDuplicatesSkipped: 0,
      evaluated: results.length, recommended, hold, excluded, failed: 0, stopReason: "source_exhausted",
    },
    results,
    skips: [],
    failures: [],
    requestSnapshot: null,
    diagnostics: {
      funnel: { evaluated: results.length, staticEligible: results.length - excluded, scoreQualified: recommended, contactReady: recommended, recommended, hold, excluded },
      querySequence: [], byCategory: {}, byQuery: {},
    },
  };
}
