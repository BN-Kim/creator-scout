import type { SqliteDatabase } from "@/server/database/database";
import { createIdentityKeys } from "@/server/history/identity-keys";
import { mergeHistoryRecord } from "@/server/history/merge-history-record";
import type { HistoryFilters, HistoryRepository } from "@/server/history/history-repository";
import type { CreatorIdentity, HistoryRecord } from "@/types/domain";

interface HistoryRow {
  id: string; identity_json: string; history_status: HistoryRecord["historyStatus"];
  final_decision: HistoryRecord["finalDecision"]; category: string; reason_codes_json: string;
  korean_explanation: string; evidence_summary: string; scouting_run_id: string;
  created_at: string; updated_at: string; manual_correction_json: string | null;
  fit_score: number | null; score_components_json: string | null; contact_ready: number | null;
  rule_version: string; recheck_at: string | null; applied_settings_json: string | null;
  decision_source: HistoryRecord["decisionSource"];
}

export class SqliteHistoryRepository implements HistoryRepository {
  constructor(private readonly database: SqliteDatabase) {}

  load(): HistoryRecord[] {
    return this.database.prepare("SELECT * FROM history_records ORDER BY created_at ASC, id ASC").all().map((row) => rowToRecord(row as HistoryRow));
  }

  search(filters: HistoryFilters): HistoryRecord[] {
    const query = filters.query?.trim().toLocaleLowerCase("ko-KR") ?? "";
    return this.load().filter((record) =>
      (!query || record.identity.channelName.toLocaleLowerCase("ko-KR").includes(query)) &&
      (!filters.status || filters.status === "all" || record.historyStatus === filters.status) &&
      (!filters.category || filters.category === "all" || record.category === filters.category));
  }

  findDuplicate(identity: CreatorIdentity): HistoryRecord | null {
    for (const key of createIdentityKeys(identity).sort((left, right) => left.priority - right.priority)) {
      const row = this.database.prepare(`SELECT records.* FROM history_identity_keys keys
        JOIN history_records records ON records.id = keys.record_id
        WHERE keys.key_type = ? AND keys.key_value = ? LIMIT 1`).get(key.type, key.value) as HistoryRow | undefined;
      if (row) return rowToRecord(row);
    }
    return null;
  }

  addOrUpdate(record: HistoryRecord): HistoryRecord[] {
    return this.addOrUpdateMany([record]);
  }

  addOrUpdateMany(records: HistoryRecord[]): HistoryRecord[] {
    this.database.transaction(() => {
      for (const record of records) {
        const existing = this.findDuplicate(record.identity);
        const next = existing ? mergeHistoryRecord(existing, record) : record;
        writeRecord(this.database, next);
      }
    }).immediate();
    return this.load();
  }

  replace(records: HistoryRecord[]): void {
    this.database.transaction(() => {
      this.database.prepare("DELETE FROM history_records").run();
      for (const record of records) {
        const existing = this.findDuplicate(record.identity);
        writeRecord(this.database, existing ? mergeHistoryRecord(existing, record) : record);
      }
    }).immediate();
  }
}

function writeRecord(database: SqliteDatabase, record: HistoryRecord): void {
  database.prepare(`INSERT INTO history_records (
    id, identity_json, history_status, final_decision, category, reason_codes_json,
    korean_explanation, evidence_summary, scouting_run_id, created_at, updated_at, manual_correction_json,
    fit_score, score_components_json, contact_ready, rule_version, recheck_at, applied_settings_json, decision_source
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    identity_json = excluded.identity_json, history_status = excluded.history_status,
    final_decision = excluded.final_decision, category = excluded.category,
    reason_codes_json = excluded.reason_codes_json, korean_explanation = excluded.korean_explanation,
    evidence_summary = excluded.evidence_summary, scouting_run_id = excluded.scouting_run_id,
    updated_at = excluded.updated_at, manual_correction_json = excluded.manual_correction_json,
    fit_score = excluded.fit_score, score_components_json = excluded.score_components_json,
    contact_ready = excluded.contact_ready, rule_version = excluded.rule_version,
    recheck_at = excluded.recheck_at, applied_settings_json = excluded.applied_settings_json,
    decision_source = excluded.decision_source`)
    .run(record.id, JSON.stringify(record.identity), record.historyStatus, record.finalDecision, record.category,
      JSON.stringify(record.reasonCodes), record.koreanExplanation, record.evidenceSummary, record.scoutingRunId,
      record.createdAt, record.updatedAt, record.manualCorrection ? JSON.stringify(record.manualCorrection) : null,
      record.fitScore, record.scoreComponents ? JSON.stringify(record.scoreComponents) : null,
      record.contactReady === null ? null : Number(record.contactReady), record.ruleVersion, record.recheckAt,
      record.appliedSettings ? JSON.stringify(record.appliedSettings) : null, record.decisionSource);
  database.prepare("DELETE FROM history_identity_keys WHERE record_id = ?").run(record.id);
  const insertKey = database.prepare("INSERT OR IGNORE INTO history_identity_keys (record_id, key_type, key_value, priority) VALUES (?, ?, ?, ?)");
  for (const key of createIdentityKeys(record.identity)) insertKey.run(record.id, key.type, key.value, key.priority);
}

function rowToRecord(row: HistoryRow): HistoryRecord {
  return {
    id: row.id,
    identity: JSON.parse(row.identity_json) as HistoryRecord["identity"],
    historyStatus: row.history_status,
    finalDecision: row.final_decision,
    category: row.category,
    reasonCodes: JSON.parse(row.reason_codes_json) as HistoryRecord["reasonCodes"],
    koreanExplanation: row.korean_explanation,
    evidenceSummary: row.evidence_summary,
    scoutingRunId: row.scouting_run_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    manualCorrection: row.manual_correction_json ? JSON.parse(row.manual_correction_json) as HistoryRecord["manualCorrection"] : null,
    fitScore: row.fit_score,
    scoreComponents: row.score_components_json ? JSON.parse(row.score_components_json) as HistoryRecord["scoreComponents"] : null,
    contactReady: row.contact_ready === null ? null : row.contact_ready === 1,
    ruleVersion: row.rule_version,
    recheckAt: row.recheck_at,
    appliedSettings: row.applied_settings_json ? JSON.parse(row.applied_settings_json) as HistoryRecord["appliedSettings"] : null,
    decisionSource: row.decision_source,
  };
}
