import { afterEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDatabase } from "@/server/database/database";
import { SqliteAutomaticRunResultRepository } from "@/server/scouting/sqlite-automatic-run-result-repository";
import type { AutomaticScoutingRunResult } from "@/server/scouting/automatic-scouting-types";

const databases: Database.Database[] = [];
const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const database of databases.splice(0)) database.close();
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("SQLite automatic run result repository", () => {
  it("persists a completed result across database connections", () => {
    const directory = mkdtempSync(join(tmpdir(), "creator-run-results-"));
    temporaryDirectories.push(directory);
    const path = join(directory, "history.sqlite");
    const database = openDatabase(path);
    databases.push(database);
    const result = fictionalResult("automatic-fictional-persisted");

    new SqliteAutomaticRunResultRepository(database).save(result);
    database.close();
    databases.splice(databases.indexOf(database), 1);

    const reopenedDatabase = openDatabase(path);
    databases.push(reopenedDatabase);
    const restartedRepository = new SqliteAutomaticRunResultRepository(reopenedDatabase);
    expect(restartedRepository.get(result.runId)).toEqual(result);
    expect(restartedRepository.listAvailableRunIds(["missing-run", result.runId])).toEqual([result.runId]);
  });

  it("updates the same run id without creating duplicate result rows", () => {
    const database = openDatabase(":memory:");
    databases.push(database);
    const repository = new SqliteAutomaticRunResultRepository(database);
    const initial = fictionalResult("automatic-fictional-idempotent");
    const updated = {
      ...initial,
      status: "completed_with_failures" as const,
      statistics: { ...initial.statistics, failed: 1 },
    };

    repository.save(initial);
    repository.save(updated);

    expect(repository.get(initial.runId)).toEqual(updated);
    expect((database.prepare("SELECT COUNT(*) AS value FROM automatic_scouting_run_results").get() as { value: number }).value).toBe(1);
  });

  it("rejects malformed stored results instead of rendering partial data", () => {
    const database = openDatabase(":memory:");
    databases.push(database);
    const repository = new SqliteAutomaticRunResultRepository(database);
    database.prepare(`INSERT INTO automatic_scouting_run_results
      (run_id, result_json, started_at, completed_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)`).run(
      "automatic-malformed",
      JSON.stringify({ runId: "automatic-malformed" }),
      "2026-07-29T00:00:00.000Z",
      "2026-07-29T00:01:00.000Z",
      "2026-07-29T00:01:00.000Z",
      "2026-07-29T00:01:00.000Z",
    );

    expect(() => repository.get("automatic-malformed")).toThrow("저장된 자동 추천 실행 결과 형식이 올바르지 않습니다.");
  });
});

function fictionalResult(runId: string): AutomaticScoutingRunResult {
  return {
    runId,
    status: "completed",
    startedAt: "2026-07-29T00:00:00.000Z",
    completedAt: "2026-07-29T00:01:00.000Z",
    statistics: {
      discoveryMode: "automatic",
      queriesAttempted: 1,
      pagesScanned: 1,
      targetRecommendedCount: 1,
      recommendationsFilled: 1,
      discovered: 1,
      priorHistorySkipped: 0,
      sameRunDuplicatesSkipped: 0,
      evaluated: 1,
      recommended: 1,
      hold: 0,
      excluded: 0,
      failed: 0,
      stopReason: "target_reached",
    },
    results: [],
    skips: [],
    failures: [],
  };
}
