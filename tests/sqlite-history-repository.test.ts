import { afterEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import { openDatabase } from "@/server/database/database";
import { createHistoryRecord } from "@/server/history/history-record";
import { SqliteHistoryRepository } from "@/server/history/sqlite-history-repository";
import { createInitialHistory, evaluateMockRun } from "@/lib/mock-run";

const databases: Database.Database[] = [];

function repository(): { database: Database.Database; repository: SqliteHistoryRepository } {
  const database = openDatabase(":memory:");
  databases.push(database);
  return { database, repository: new SqliteHistoryRepository(database) };
}

afterEach(() => {
  for (const database of databases.splice(0)) database.close();
});

describe("SQLite history repository", () => {
  it("applies the versioned schema migration", () => {
    const { database } = repository();
    const migrations = database.prepare("SELECT version, name FROM schema_migrations ORDER BY version").all() as Array<{ version: number; name: string }>;
    const tables = database.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((row) => (row as { name: string }).name);
    expect(migrations).toEqual([
      { version: 1, name: "create_history_records" },
      { version: 2, name: "create_discovery_state" },
      { version: 3, name: "create_operational_scheduler" },
      { version: 4, name: "persist_automatic_run_results" },
    ]);
    expect(tables).toEqual(expect.arrayContaining([
      "history_records", "history_identity_keys", "discovery_query_state", "discovery_learned_terms",
      "operation_control", "scheduled_scouting_jobs", "operation_leases", "scouting_run_executions", "operational_events",
      "automatic_scouting_run_results",
    ]));
  });

  it("preserves decisions, evidence, run timestamps, and manual corrections", () => {
    const { repository: history } = repository();
    const creator = evaluateMockRun(createInitialHistory())[0];
    const manualCorrection = { code: "other_invalid" as const, note: "허구 목 교정", correctedAt: "2026-07-22T08:00:00.000Z" };
    const record = createHistoryRecord({ ...creator, manualCorrection }, "mock-run");
    history.addOrUpdate(record);
    expect(history.load()).toEqual([record]);
  });

  it("uses one record for repeated and competing writes of the same identity", async () => {
    const { database, repository: first } = repository();
    const second = new SqliteHistoryRepository(database);
    const creator = evaluateMockRun(createInitialHistory())[0];
    const record = createHistoryRecord(creator, "run-one");
    const competing = { ...record, id: "history-competing", scoutingRunId: "run-two" };
    await Promise.all([
      Promise.resolve().then(() => first.addOrUpdate(record)),
      Promise.resolve().then(() => second.addOrUpdate(competing)),
    ]);
    expect(first.load()).toHaveLength(1);
    expect(first.findDuplicate(creator.identity)?.id).toBe(record.id);
  });

  it("merges stronger identity evidence without losing the original creation time", () => {
    const { repository: history } = repository();
    const creator = evaluateMockRun(createInitialHistory())[0];
    const strong = createHistoryRecord(creator, "run-two");
    const weak = { ...strong, identity: { ...strong.identity, youtubeChannelId: null }, updatedAt: "2026-07-22T06:00:00.000Z" };
    history.addOrUpdate(weak);
    history.addOrUpdate(strong);
    const loaded = history.load()[0];
    expect(loaded.identity.youtubeChannelId).toBe(strong.identity.youtubeChannelId);
    expect(loaded.createdAt).toBe(weak.createdAt);
  });
});
