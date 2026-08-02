import type { SqliteDatabase } from "@/server/database/database";
import { isPermanentHardExclusionReason, legacyRecommendationRuleVersion } from "@/config/recommendation-rules";
import type {
  AutomaticScoutingDecisionBreakdown,
  AutomaticScoutingDiagnostics,
  AutomaticScoutingRunResult,
} from "@/server/scouting/automatic-scouting-types";
import type { EvaluatedCreator } from "@/types/domain";

interface ResultRow {
  result_json: string;
}

export class SqliteAutomaticRunResultRepository {
  constructor(private readonly database: SqliteDatabase) {}

  save(result: AutomaticScoutingRunResult): void {
    const now = new Date().toISOString();
    this.database.prepare(`INSERT INTO automatic_scouting_run_results
      (run_id, result_json, started_at, completed_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(run_id) DO UPDATE SET
        result_json = excluded.result_json,
        started_at = excluded.started_at,
        completed_at = excluded.completed_at,
        updated_at = excluded.updated_at`)
      .run(result.runId, JSON.stringify(result), result.startedAt, result.completedAt, now, now);
  }

  get(runId: string): AutomaticScoutingRunResult | null {
    const row = this.database.prepare(
      "SELECT result_json FROM automatic_scouting_run_results WHERE run_id = ?",
    ).get(runId) as ResultRow | undefined;
    return row ? parseStoredResult(row.result_json, runId) : null;
  }

  listAvailableRunIds(runIds: readonly string[]): string[] {
    if (runIds.length === 0) return [];
    const uniqueIds = [...new Set(runIds)];
    const placeholders = uniqueIds.map(() => "?").join(", ");
    const rows = this.database.prepare(
      `SELECT run_id FROM automatic_scouting_run_results WHERE run_id IN (${placeholders})`,
    ).all(...uniqueIds) as Array<{ run_id: string }>;
    return rows.map((row) => row.run_id);
  }

  list(limit = 100): AutomaticScoutingRunResult[] {
    if (!Number.isInteger(limit) || limit < 1 || limit > 1_000) throw new Error("실행 결과 조회 한도가 올바르지 않습니다.");
    const rows = this.database.prepare(
      "SELECT run_id, result_json FROM automatic_scouting_run_results ORDER BY completed_at DESC LIMIT ?",
    ).all(limit) as Array<{ run_id: string; result_json: string }>;
    return rows.map((row) => parseStoredResult(row.result_json, row.run_id));
  }

  resetForTests(): void {
    this.database.prepare("DELETE FROM automatic_scouting_run_results").run();
  }
}

function parseStoredResult(value: string, expectedRunId: string): AutomaticScoutingRunResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value) as unknown;
  } catch {
    throw new Error("저장된 자동 스카우트 실행 결과 JSON이 올바르지 않습니다.");
  }
  if (!isRunResultShape(parsed) || parsed.runId !== expectedRunId) {
    throw new Error("저장된 자동 스카우트 실행 결과 형식이 올바르지 않습니다.");
  }
  return normalizeStoredResult(parsed);
}

function isRunResultShape(value: unknown): value is AutomaticScoutingRunResult {
  if (!isRecord(value) || typeof value.runId !== "string") return false;
  if (value.status !== "completed" && value.status !== "completed_with_failures") return false;
  if (typeof value.startedAt !== "string" || typeof value.completedAt !== "string") return false;
  if (!Array.isArray(value.results) || !Array.isArray(value.skips) || !Array.isArray(value.failures)) return false;
  if (!isRecord(value.statistics)) return false;
  return typeof value.statistics.targetRecommendedCount === "number"
    && typeof value.statistics.recommendationsFilled === "number"
    && typeof value.statistics.stopReason === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeStoredResult(value: AutomaticScoutingRunResult): AutomaticScoutingRunResult {
  const results = value.results.map(normalizeStoredCreator);
  return {
    ...value,
    runKind: value.runKind ?? "discovery",
    sourceRunId: value.sourceRunId ?? null,
    statistics: {
      ...value.statistics,
      historyReevaluated: value.statistics.historyReevaluated ?? 0,
      manualOverrideSkipped: value.statistics.manualOverrideSkipped ?? 0,
    },
    results,
    requestSnapshot: value.requestSnapshot ?? null,
    diagnostics: value.diagnostics ?? buildLegacyDiagnostics(results),
  };
}

function normalizeStoredCreator(creator: EvaluatedCreator): EvaluatedCreator {
  const legacy = creator as EvaluatedCreator & Partial<Pick<
    EvaluatedCreator,
    "fitScore" | "scoreComponents" | "contactReady" | "ruleVersion" | "recheckAt" | "appliedSettings" | "decisionSource"
  >>;
  return {
    ...creator,
    fitScore: legacy.fitScore ?? null,
    scoreComponents: legacy.scoreComponents ?? null,
    contactReady: legacy.contactReady ?? (
      creator.evidence.emailClassification === "personal"
      && creator.evidence.emailVerificationState === "confirmed"
      && Boolean(creator.evidence.visibleEmail?.trim())
    ),
    ruleVersion: legacy.ruleVersion ?? legacyRecommendationRuleVersion,
    recheckAt: legacy.recheckAt ?? null,
    appliedSettings: legacy.appliedSettings ?? null,
    decisionSource: legacy.decisionSource ?? (creator.manualCorrection ? "manual" : "system"),
  };
}

function buildLegacyDiagnostics(results: EvaluatedCreator[]): AutomaticScoutingDiagnostics {
  const diagnostics: AutomaticScoutingDiagnostics = {
    funnel: emptyBreakdown(),
    querySequence: [],
    byCategory: {},
    byQuery: {},
  };
  for (const creator of results) {
    const category = creator.identity.category || "미분류";
    diagnostics.byCategory[category] ??= emptyBreakdown();
    for (const breakdown of [diagnostics.funnel, diagnostics.byCategory[category]]) {
      breakdown.evaluated += 1;
      if (!creator.reasonCodes.some(isPermanentHardExclusionReason)) breakdown.staticEligible += 1;
      if (creator.fitScore !== null && creator.fitScore >= 70) breakdown.scoreQualified += 1;
      if (creator.contactReady) breakdown.contactReady += 1;
      breakdown[creator.decision] += 1;
    }
  }

  return diagnostics;
}

function emptyBreakdown(): AutomaticScoutingDecisionBreakdown {
  return {
    evaluated: 0,
    staticEligible: 0,
    scoreQualified: 0,
    contactReady: 0,
    recommended: 0,
    hold: 0,
    excluded: 0,
  };
}
