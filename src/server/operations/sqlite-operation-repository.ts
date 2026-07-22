import type { SqliteDatabase } from "@/server/database/database";
import { parseAutomaticRunConfiguration } from "@/server/operations/automatic-run-configuration";
import type { OperationRepository } from "@/server/operations/operation-repository";
import type {
  OperationControlState,
  OperationalEvent,
  OperationLease,
  OperationMonitoringSnapshot,
  ScheduledScoutingJob,
  ScoutingRunExecution,
} from "@/server/operations/operation-types";

interface ControlRow { paused: number; reason: string | null; updated_at: string }
interface ScheduleRow {
  id: string; name: string; enabled: number; interval_minutes: number; request_json: string; next_run_at: string;
  last_run_at: string | null; consecutive_failures: number; max_retries: number; created_at: string; updated_at: string;
}
interface ExecutionRow {
  id: string; correlation_id: string; job_id: string | null; trigger_type: ScoutingRunExecution["trigger"];
  status: ScoutingRunExecution["status"]; attempt_count: number; run_id: string | null; stop_reason: string | null;
  prior_history_skipped: number; failed_candidates: number; error_category: string | null;
  started_at: string; completed_at: string | null; updated_at: string;
}
interface EventRow {
  id: string; correlation_id: string; execution_id: string | null; event_type: string;
  level: OperationalEvent["level"]; message: string; metadata_json: string; created_at: string;
}

export class SqliteOperationRepository implements OperationRepository {
  constructor(private readonly database: SqliteDatabase) {}

  getControlState(): OperationControlState {
    const row = this.database.prepare("SELECT paused, reason, updated_at FROM operation_control WHERE singleton_id = 1").get() as ControlRow;
    return { paused: row.paused === 1, reason: row.reason, updatedAt: row.updated_at };
  }

  setPaused(paused: boolean, reason: string | null, now: string): OperationControlState {
    this.database.prepare("UPDATE operation_control SET paused = ?, reason = ?, updated_at = ? WHERE singleton_id = 1")
      .run(paused ? 1 : 0, reason, now);
    return this.getControlState();
  }

  createSchedule(input: Parameters<OperationRepository["createSchedule"]>[0]): ScheduledScoutingJob {
    this.database.prepare(`INSERT INTO scheduled_scouting_jobs
      (id, name, enabled, interval_minutes, request_json, next_run_at, max_retries, created_at, updated_at)
      VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?)`).run(
      input.id, input.name, input.intervalMinutes, JSON.stringify(input.request), input.nextRunAt, input.maxRetries, input.now, input.now,
    );
    return this.listSchedules().find((job) => job.id === input.id) ?? fail("예약 작업을 저장하지 못했습니다.");
  }

  listSchedules(): ScheduledScoutingJob[] {
    return (this.database.prepare("SELECT * FROM scheduled_scouting_jobs ORDER BY created_at DESC").all() as ScheduleRow[]).map(toSchedule);
  }

  listDueSchedules(now: string): ScheduledScoutingJob[] {
    return (this.database.prepare("SELECT * FROM scheduled_scouting_jobs WHERE enabled = 1 AND next_run_at <= ? ORDER BY next_run_at, id").all(now) as ScheduleRow[]).map(toSchedule);
  }

  updateScheduleAfterRun(id: string, input: Parameters<OperationRepository["updateScheduleAfterRun"]>[1]): void {
    this.database.prepare(`UPDATE scheduled_scouting_jobs SET last_run_at = ?, next_run_at = ?,
      consecutive_failures = CASE WHEN ? = 1 THEN 0 ELSE consecutive_failures + 1 END, updated_at = ? WHERE id = ?`)
      .run(input.lastRunAt, input.nextRunAt, input.succeeded ? 1 : 0, input.now, id);
  }

  setScheduleEnabled(id: string, enabled: boolean, now: string): void {
    const result = this.database.prepare("UPDATE scheduled_scouting_jobs SET enabled = ?, updated_at = ? WHERE id = ?")
      .run(enabled ? 1 : 0, now, id);
    if (result.changes !== 1) throw new Error("예약 작업을 찾을 수 없습니다.");
  }

  tryAcquireLease(lease: OperationLease): boolean {
    const result = this.database.prepare(`INSERT INTO operation_leases
      (lock_key, owner_id, correlation_id, acquired_at, expires_at) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(lock_key) DO UPDATE SET owner_id = excluded.owner_id, correlation_id = excluded.correlation_id,
      acquired_at = excluded.acquired_at, expires_at = excluded.expires_at
      WHERE operation_leases.expires_at <= excluded.acquired_at`).run(
      lease.lockKey, lease.ownerId, lease.correlationId, lease.acquiredAt, lease.expiresAt,
    );
    return result.changes === 1;
  }

  renewLease(lockKey: string, ownerId: string, expiresAt: string): boolean {
    return this.database.prepare("UPDATE operation_leases SET expires_at = ? WHERE lock_key = ? AND owner_id = ?")
      .run(expiresAt, lockKey, ownerId).changes === 1;
  }

  releaseLease(lockKey: string, ownerId: string): void {
    this.database.prepare("DELETE FROM operation_leases WHERE lock_key = ? AND owner_id = ?").run(lockKey, ownerId);
  }

  deleteExpiredLeases(now: string): number {
    return this.database.prepare("DELETE FROM operation_leases WHERE expires_at <= ?").run(now).changes;
  }

  createExecution(execution: ScoutingRunExecution): void {
    this.database.prepare(`INSERT INTO scouting_run_executions
      (id, correlation_id, job_id, trigger_type, status, attempt_count, run_id, stop_reason,
       prior_history_skipped, failed_candidates, error_category, started_at, completed_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(...executionValues(execution));
  }

  updateExecution(execution: ScoutingRunExecution): void {
    const result = this.database.prepare(`UPDATE scouting_run_executions SET status = ?, attempt_count = ?, run_id = ?,
      stop_reason = ?, prior_history_skipped = ?, failed_candidates = ?, error_category = ?, completed_at = ?, updated_at = ? WHERE id = ?`).run(
      execution.status, execution.attemptCount, execution.runId, execution.stopReason, execution.priorHistorySkipped,
      execution.failedCandidates, execution.errorCategory, execution.completedAt, execution.updatedAt, execution.id,
    );
    if (result.changes !== 1) throw new Error("운영 실행 기록을 찾을 수 없습니다.");
  }

  getExecution(id: string): ScoutingRunExecution | null {
    const row = this.database.prepare("SELECT * FROM scouting_run_executions WHERE id = ?").get(id) as ExecutionRow | undefined;
    return row ? toExecution(row) : null;
  }

  listExecutions(limit = 50): ScoutingRunExecution[] {
    return (this.database.prepare("SELECT * FROM scouting_run_executions ORDER BY started_at DESC LIMIT ?").all(limit) as ExecutionRow[]).map(toExecution);
  }

  markInterruptedExecutions(now: string): ScoutingRunExecution[] {
    const interrupted = (this.database.prepare(`SELECT execution.* FROM scouting_run_executions execution
      LEFT JOIN operation_leases lease ON lease.correlation_id = execution.correlation_id AND lease.expires_at > ?
      WHERE execution.status = 'running' AND lease.correlation_id IS NULL`).all(now) as ExecutionRow[]).map(toExecution);
    const update = this.database.prepare("UPDATE scouting_run_executions SET status = 'interrupted', error_category = 'interrupted', completed_at = ?, updated_at = ? WHERE id = ? AND status = 'running'");
    this.database.transaction(() => {
      for (const execution of interrupted) update.run(now, now, execution.id);
    })();
    return interrupted.map((execution) => ({ ...execution, status: "interrupted", errorCategory: "interrupted", completedAt: now, updatedAt: now }));
  }

  addEvent(event: OperationalEvent): void {
    this.database.prepare(`INSERT INTO operational_events
      (id, correlation_id, execution_id, event_type, level, message, metadata_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
      event.id, event.correlationId, event.executionId, event.eventType, event.level,
      event.message, JSON.stringify(event.metadata), event.createdAt,
    );
  }

  listEvents(limit = 100): OperationalEvent[] {
    return (this.database.prepare("SELECT * FROM operational_events ORDER BY created_at DESC LIMIT ?").all(limit) as EventRow[]).map(toEvent);
  }

  getMonitoringSnapshot(now: string): OperationMonitoringSnapshot {
    const scalar = (sql: string, ...params: Array<string | number>): number =>
      (this.database.prepare(sql).get(...params) as { value: number }).value;
    const timestamp = (status: string): string | null =>
      (this.database.prepare("SELECT MAX(completed_at) AS value FROM scouting_run_executions WHERE status = ?").get(status) as { value: string | null }).value;
    return {
      control: this.getControlState(),
      dueJobs: scalar("SELECT COUNT(*) AS value FROM scheduled_scouting_jobs WHERE enabled = 1 AND next_run_at <= ?", now),
      enabledJobs: scalar("SELECT COUNT(*) AS value FROM scheduled_scouting_jobs WHERE enabled = 1"),
      runningExecutions: scalar("SELECT COUNT(*) AS value FROM scouting_run_executions WHERE status = 'running'"),
      succeededExecutions: scalar("SELECT COUNT(*) AS value FROM scouting_run_executions WHERE status = 'succeeded'"),
      failedExecutions: scalar("SELECT COUNT(*) AS value FROM scouting_run_executions WHERE status = 'failed'"),
      interruptedExecutions: scalar("SELECT COUNT(*) AS value FROM scouting_run_executions WHERE status = 'interrupted'"),
      lockConflicts: scalar("SELECT COUNT(*) AS value FROM scouting_run_executions WHERE status = 'skipped_locked'"),
      priorHistorySkipped: scalar("SELECT COALESCE(SUM(prior_history_skipped), 0) AS value FROM scouting_run_executions"),
      failedCandidates: scalar("SELECT COALESCE(SUM(failed_candidates), 0) AS value FROM scouting_run_executions"),
      lastSuccessAt: timestamp("succeeded"),
      lastFailureAt: timestamp("failed"),
    };
  }

  resetForTests(now: string): void {
    this.database.transaction(() => {
      this.database.prepare("DELETE FROM operational_events").run();
      this.database.prepare("DELETE FROM scouting_run_executions").run();
      this.database.prepare("DELETE FROM operation_leases").run();
      this.database.prepare("DELETE FROM scheduled_scouting_jobs").run();
      this.database.prepare("UPDATE operation_control SET paused = 0, reason = NULL, updated_at = ? WHERE singleton_id = 1").run(now);
    })();
  }
}

function toSchedule(row: ScheduleRow): ScheduledScoutingJob {
  const request = parseAutomaticRunConfiguration(parseJson(row.request_json));
  if (!request) throw new Error("저장된 예약 실행 설정이 올바르지 않습니다.");
  return {
    id: row.id, name: row.name, enabled: row.enabled === 1, intervalMinutes: row.interval_minutes, request,
    nextRunAt: row.next_run_at, lastRunAt: row.last_run_at, consecutiveFailures: row.consecutive_failures,
    maxRetries: row.max_retries, createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

function toExecution(row: ExecutionRow): ScoutingRunExecution {
  return {
    id: row.id, correlationId: row.correlation_id, jobId: row.job_id, trigger: row.trigger_type, status: row.status,
    attemptCount: row.attempt_count, runId: row.run_id, stopReason: row.stop_reason,
    priorHistorySkipped: row.prior_history_skipped, failedCandidates: row.failed_candidates,
    errorCategory: row.error_category, startedAt: row.started_at, completedAt: row.completed_at, updatedAt: row.updated_at,
  };
}

function toEvent(row: EventRow): OperationalEvent {
  const metadata = parseJson(row.metadata_json);
  if (!isMetadata(metadata)) throw new Error("저장된 운영 이벤트 메타데이터가 올바르지 않습니다.");
  return {
    id: row.id, correlationId: row.correlation_id, executionId: row.execution_id, eventType: row.event_type,
    level: row.level, message: row.message, metadata, createdAt: row.created_at,
  };
}

function executionValues(execution: ScoutingRunExecution): Array<string | number | null> {
  return [
    execution.id, execution.correlationId, execution.jobId, execution.trigger, execution.status, execution.attemptCount,
    execution.runId, execution.stopReason, execution.priorHistorySkipped, execution.failedCandidates,
    execution.errorCategory, execution.startedAt, execution.completedAt, execution.updatedAt,
  ];
}

function parseJson(value: string): unknown {
  try { return JSON.parse(value) as unknown; }
  catch { throw new Error("저장된 JSON 데이터가 올바르지 않습니다."); }
}

function isMetadata(value: unknown): value is Record<string, string | number | boolean | null> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    && Object.values(value).every((item) => item === null || ["string", "number", "boolean"].includes(typeof item));
}

function fail(message: string): never { throw new Error(message); }
