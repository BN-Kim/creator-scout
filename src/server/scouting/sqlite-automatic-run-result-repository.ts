import type { SqliteDatabase } from "@/server/database/database";
import type { AutomaticScoutingRunResult } from "@/server/scouting/automatic-scouting-types";

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

  resetForTests(): void {
    this.database.prepare("DELETE FROM automatic_scouting_run_results").run();
  }
}

function parseStoredResult(value: string, expectedRunId: string): AutomaticScoutingRunResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value) as unknown;
  } catch {
    throw new Error("저장된 자동 추천 실행 결과 JSON이 올바르지 않습니다.");
  }
  if (!isRunResultShape(parsed) || parsed.runId !== expectedRunId) {
    throw new Error("저장된 자동 추천 실행 결과 형식이 올바르지 않습니다.");
  }
  return parsed;
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
