import type { SqliteDatabase } from "@/server/database/database";
import type { ManualDecisionAudit } from "@/types/domain";

interface AuditRow {
  id: string;
  history_record_id: string;
  run_id: string;
  creator_internal_id: string;
  previous_decision: ManualDecisionAudit["previousDecision"];
  next_decision: ManualDecisionAudit["nextDecision"];
  reason_code: ManualDecisionAudit["reason"];
  note: string;
  actor: string;
  changed_at: string;
}

export class SqliteDecisionAuditRepository {
  constructor(private readonly database: SqliteDatabase) {}

  add(record: ManualDecisionAudit): void {
    this.database.prepare(`INSERT INTO creator_decision_audit (
      id, history_record_id, run_id, creator_internal_id, previous_decision,
      next_decision, reason_code, note, actor, changed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      record.id,
      record.historyRecordId,
      record.runId,
      record.creatorInternalId,
      record.previousDecision,
      record.nextDecision,
      record.reason,
      record.note,
      record.actor,
      record.changedAt,
    );
  }

  list(filters: { runId?: string; creatorInternalId?: string; historyRecordId?: string } = {}): ManualDecisionAudit[] {
    return (this.database.prepare("SELECT * FROM creator_decision_audit ORDER BY changed_at DESC, id DESC").all() as AuditRow[])
      .map(toAudit)
      .filter((record) =>
        (!filters.runId || record.runId === filters.runId)
        && (!filters.creatorInternalId || record.creatorInternalId === filters.creatorInternalId)
        && (!filters.historyRecordId || record.historyRecordId === filters.historyRecordId));
  }
}

function toAudit(row: AuditRow): ManualDecisionAudit {
  return {
    id: row.id,
    historyRecordId: row.history_record_id,
    runId: row.run_id,
    creatorInternalId: row.creator_internal_id,
    previousDecision: row.previous_decision,
    nextDecision: row.next_decision,
    reason: row.reason_code,
    note: row.note,
    actor: row.actor,
    changedAt: row.changed_at,
  };
}
