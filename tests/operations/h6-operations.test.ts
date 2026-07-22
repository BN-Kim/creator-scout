import { afterEach, describe, expect, it, vi } from "vitest";
import type Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDatabase } from "@/server/database/database";
import { parseAutomaticRunConfiguration } from "@/server/operations/automatic-run-configuration";
import { OperationCoordinator, automaticScoutingLockKey } from "@/server/operations/operation-coordinator";
import { loadOperationConfig, type OperationConfig } from "@/server/operations/operation-config";
import { OperationLogger } from "@/server/operations/operation-logger";
import { OperationalScheduler } from "@/server/operations/operational-scheduler";
import { SqliteOperationRepository } from "@/server/operations/sqlite-operation-repository";
import { nextScheduledAt, retryDelayMs } from "@/server/operations/operation-timing";
import type { ScoutingRunExecution } from "@/server/operations/operation-types";
import type { AutomaticRunConfiguration } from "@/server/operations/operation-types";
import type { AutomaticScoutingRunResult } from "@/server/scouting/automatic-scouting-types";

const BASE_TIME = new Date("2026-07-22T12:00:00.000Z");
const databases: Database.Database[] = [];
const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const database of databases.splice(0)) database.close();
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("H6 scheduling and operations", () => {
  it("loads bounded scheduler settings and supports explicitly disabling only the background timer", () => {
    expect(loadOperationConfig({
      OPERATIONS_SCHEDULER_ENABLED: "0", OPERATIONS_SCHEDULER_POLL_MS: "2000",
      OPERATIONS_MIN_RUN_INTERVAL_MS: "3000", OPERATIONS_LEASE_DURATION_MS: "60000",
      OPERATIONS_RETRY_BASE_DELAY_MS: "50", OPERATIONS_MAX_RETRIES: "3",
    })).toEqual({
      schedulerEnabled: false, schedulerPollMs: 2000, minimumRunStartIntervalMs: 3000,
      leaseDurationMs: 60000, retryBaseDelayMs: 50, defaultMaxRetries: 3,
    });
    expect(() => loadOperationConfig({ OPERATIONS_MAX_RETRIES: "11" })).toThrow();
    expect(() => loadOperationConfig({ OPERATIONS_SCHEDULER_ENABLED: "false" })).toThrow();
  });

  it("persists schedules and advances missed intervals to the next future occurrence", () => {
    const { repository } = createRepository();
    const request = configuration();
    const job = repository.createSchedule({
      id: "schedule-fictional", name: "허구 정기 실행", intervalMinutes: 30, request,
      nextRunAt: "2026-07-22T10:00:00.000Z", maxRetries: 2, now: BASE_TIME.toISOString(),
    });
    expect(repository.listDueSchedules(BASE_TIME.toISOString())).toHaveLength(1);
    expect(nextScheduledAt(job.nextRunAt, job.intervalMinutes, BASE_TIME)).toBe("2026-07-22T12:30:00.000Z");
  });

  it("allows only one owner to hold the distributed SQLite lease and permits takeover after expiry", () => {
    const directory = mkdtempSync(join(tmpdir(), "creator-operations-"));
    temporaryDirectories.push(directory);
    const databasePath = join(directory, "operations.sqlite");
    const firstDatabase = openDatabase(databasePath);
    const secondDatabase = openDatabase(databasePath);
    databases.push(firstDatabase, secondDatabase);
    const first = new SqliteOperationRepository(firstDatabase);
    const second = new SqliteOperationRepository(secondDatabase);
    expect(first.tryAcquireLease(lease("owner-one", "correlation-one", "2026-07-22T12:10:00.000Z"))).toBe(true);
    expect(second.tryAcquireLease(lease("owner-two", "correlation-two", "2026-07-22T12:10:00.000Z"))).toBe(false);
    expect(second.tryAcquireLease({ ...lease("owner-two", "correlation-two", "2026-07-22T12:20:00.000Z"), acquiredAt: "2026-07-22T12:11:00.000Z" })).toBe(true);
  });

  it("does not evaluate a candidate after losing ownership of the execution lease", async () => {
    const { repository } = createRepository();
    vi.spyOn(repository, "renewLease").mockReturnValue(false);
    let calls = 0;
    const coordinator = coordinatorHarness(repository, {
      executeRun: async (_configuration, runId) => { calls += 1; return result(runId); },
    });
    const outcome = await coordinator.executeManual(configuration());
    expect(outcome).toMatchObject({ kind: "failed", errorCategory: "lock_lost" });
    expect(calls).toBe(0);
  });

  it("limits retry attempts and exponential retry delays", async () => {
    const { repository } = createRepository();
    const sleeps: number[] = [];
    let attempts = 0;
    const coordinator = coordinatorHarness(repository, {
      executeRun: async () => { attempts += 1; throw Object.assign(new Error("fictional secret body"), { retryable: true }); },
      config: { ...testConfig, retryBaseDelayMs: 25 },
      sleep: async (duration) => { sleeps.push(duration); },
    });
    const outcome = await coordinator.executeScheduled(schedule(repository, { maxRetries: 2 }));
    expect(outcome.kind).toBe("failed");
    expect(attempts).toBe(3);
    expect(sleeps).toEqual([25, 50]);
    expect(retryDelayMs(25, 3)).toBe(100);
    expect(JSON.stringify(repository.listEvents())).not.toContain("fictional secret body");
  });

  it("applies a bounded start interval between runs", async () => {
    const { repository } = createRepository();
    let current = BASE_TIME.getTime();
    const sleeps: number[] = [];
    const now = (): Date => new Date(current);
    const coordinator = coordinatorHarness(repository, {
      executeRun: async (_configuration, runId) => result(runId),
      config: { ...testConfig, minimumRunStartIntervalMs: 1_000 }, now,
      sleep: async (duration) => { sleeps.push(duration); current += duration; },
    });
    await coordinator.executeManual(configuration());
    current += 200;
    await coordinator.executeManual(configuration());
    expect(sleeps).toEqual([800]);
  });

  it("runs due schedules once and does not overlap scheduler ticks", async () => {
    const { repository } = createRepository();
    const job = schedule(repository, { nextRunAt: BASE_TIME.toISOString() });
    let executions = 0;
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const coordinator = coordinatorHarness(repository, {
      executeRun: async (_configuration, runId) => { executions += 1; await gate; return result(runId); },
    });
    const scheduler = new OperationalScheduler(repository, coordinator, () => BASE_TIME);
    const first = scheduler.tick();
    const second = scheduler.tick();
    release();
    await Promise.all([first, second]);
    expect(executions).toBe(1);
    expect(repository.listExecutions().filter((execution) => execution.jobId === job.id && execution.status === "succeeded")).toHaveLength(1);
  });

  it("recovers an interrupted scheduled execution after its lease expires", async () => {
    const { repository } = createRepository();
    const job = schedule(repository, { nextRunAt: BASE_TIME.toISOString() });
    repository.tryAcquireLease({
      lockKey: automaticScoutingLockKey, ownerId: "dead-owner", correlationId: "dead-correlation",
      acquiredAt: "2026-07-22T11:00:00.000Z", expiresAt: "2026-07-22T11:30:00.000Z",
    });
    repository.createExecution(runningExecution(job.id));
    let recovered = 0;
    const coordinator = coordinatorHarness(repository, {
      executeRun: async (_configuration, runId) => { recovered += 1; return result(runId); },
    });
    expect(await coordinator.recoverInterruptedExecutions()).toEqual([job.id]);
    expect(recovered).toBe(1);
    expect(repository.getExecution("execution-dead")?.status).toBe("interrupted");
    expect(repository.listExecutions().some((execution) => execution.trigger === "recovery" && execution.status === "succeeded")).toBe(true);
  });

  it("tracks correlated statistics and monitoring signals without logging secrets", async () => {
    const { repository } = createRepository();
    const lines: string[] = [];
    const ids = idSequence();
    const logger = new OperationLogger(repository, () => BASE_TIME, (line) => lines.push(line), ids);
    logger.log({ correlationId: "correlation-safe", eventType: "fixture", level: "info", message: "허구 이벤트", metadata: { reason: "safe", apiKey: "secret-value" } });
    const coordinator = coordinatorHarness(repository, {
      executeRun: async (_configuration, runId) => result(runId, { priorHistorySkipped: 4, failed: 2 }), logger,
    });
    const outcome = await coordinator.executeManual(configuration());
    const snapshot = repository.getMonitoringSnapshot(BASE_TIME.toISOString());
    expect(outcome.kind).toBe("completed");
    expect(snapshot).toMatchObject({ succeededExecutions: 1, priorHistorySkipped: 4, failedCandidates: 2 });
    expect(repository.listEvents().every((event) => event.correlationId.length > 0)).toBe(true);
    expect(lines.join(" ")).not.toContain("secret-value");
  });

  it("pauses new work and resumes without changing creator decision behavior", async () => {
    const { repository } = createRepository();
    let calls = 0;
    const coordinator = coordinatorHarness(repository, { executeRun: async (_configuration, runId) => { calls += 1; return result(runId); } });
    repository.setPaused(true, "허구 점검", BASE_TIME.toISOString());
    expect((await coordinator.executeManual(configuration())).kind).toBe("paused");
    expect(calls).toBe(0);
    repository.setPaused(false, null, BASE_TIME.toISOString());
    expect((await coordinator.executeManual(configuration())).kind).toBe("completed");
    expect(calls).toBe(1);
  });
});

const testConfig: OperationConfig = {
  schedulerEnabled: true, schedulerPollMs: 1_000, minimumRunStartIntervalMs: 0, leaseDurationMs: 60_000,
  retryBaseDelayMs: 0, defaultMaxRetries: 2,
};

function createRepository(): { database: Database.Database; repository: SqliteOperationRepository } {
  const database = openDatabase(":memory:");
  databases.push(database);
  return { database, repository: new SqliteOperationRepository(database) };
}

function configuration() {
  const parsed = parseAutomaticRunConfiguration({ targetRecommendedCount: 1 });
  if (!parsed) throw new Error("허구 실행 설정 생성 실패");
  return parsed;
}

function schedule(repository: SqliteOperationRepository, patch: { maxRetries?: number; nextRunAt?: string } = {}) {
  return repository.createSchedule({
    id: `schedule-${repository.listSchedules().length + 1}`, name: "허구 예약", intervalMinutes: 60,
    request: configuration(), nextRunAt: patch.nextRunAt ?? "2026-07-22T13:00:00.000Z",
    maxRetries: patch.maxRetries ?? 0, now: BASE_TIME.toISOString(),
  });
}

function coordinatorHarness(
  repository: SqliteOperationRepository,
  patch: Partial<{ executeRun: (configuration: AutomaticRunConfiguration, runId: string) => Promise<AutomaticScoutingRunResult>; config: OperationConfig; now: () => Date; sleep: (duration: number) => Promise<void>; logger: OperationLogger }> = {},
): OperationCoordinator {
  const ids = idSequence();
  const now = patch.now ?? (() => BASE_TIME);
  const logger = patch.logger ?? new OperationLogger(repository, now, () => undefined, ids);
  return new OperationCoordinator({
    repository, config: patch.config ?? testConfig,
    executeRun: patch.executeRun ?? (async (_configuration, runId) => result(runId)),
    now, sleep: patch.sleep ?? (async () => undefined), logger, createId: ids, ownerId: `owner-${ids()}`,
  });
}

function result(runId: string, stats: Partial<AutomaticScoutingRunResult["statistics"]> = {}): AutomaticScoutingRunResult {
  return {
    runId, status: "completed", startedAt: BASE_TIME.toISOString(), completedAt: BASE_TIME.toISOString(),
    statistics: {
      discoveryMode: "automatic", queriesAttempted: 1, pagesScanned: 1, targetRecommendedCount: 1,
      recommendationsFilled: 1, discovered: 1, priorHistorySkipped: 0, sameRunDuplicatesSkipped: 0,
      evaluated: 1, recommended: 1, hold: 0, excluded: 0, failed: 0, stopReason: "target_reached", ...stats,
    },
    results: [], skips: [], failures: [],
  };
}

function lease(ownerId: string, correlationId: string, expiresAt: string) {
  return { lockKey: automaticScoutingLockKey, ownerId, correlationId, acquiredAt: BASE_TIME.toISOString(), expiresAt };
}

function runningExecution(jobId: string): ScoutingRunExecution {
  return {
    id: "execution-dead", correlationId: "dead-correlation", jobId, trigger: "scheduled", status: "running",
    attemptCount: 1, runId: "automatic-dead", stopReason: null, priorHistorySkipped: 0, failedCandidates: 0,
    errorCategory: null, startedAt: "2026-07-22T11:00:00.000Z", completedAt: null, updatedAt: "2026-07-22T11:00:00.000Z",
  };
}

function idSequence(): () => string {
  let value = 0;
  return () => `fictional-${++value}`;
}
