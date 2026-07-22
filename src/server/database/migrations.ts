export interface DatabaseMigration {
  version: number;
  name: string;
  statements: readonly string[];
}

export const databaseMigrations: readonly DatabaseMigration[] = [
  {
    version: 1,
    name: "create_history_records",
    statements: [
      `CREATE TABLE history_records (
        id TEXT PRIMARY KEY,
        identity_json TEXT NOT NULL,
        history_status TEXT NOT NULL CHECK (history_status IN ('recommended', 'candidate', 'excluded')),
        final_decision TEXT NOT NULL CHECK (final_decision IN ('recommended', 'hold', 'excluded')),
        category TEXT NOT NULL,
        reason_codes_json TEXT NOT NULL,
        korean_explanation TEXT NOT NULL,
        evidence_summary TEXT NOT NULL,
        scouting_run_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        manual_correction_json TEXT
      ) STRICT`,
      `CREATE TABLE history_identity_keys (
        record_id TEXT NOT NULL REFERENCES history_records(id) ON DELETE CASCADE,
        key_type TEXT NOT NULL CHECK (key_type IN ('channel_id', 'canonical_url', 'handle', 'name')),
        key_value TEXT NOT NULL,
        priority INTEGER NOT NULL,
        PRIMARY KEY (key_type, key_value)
      ) STRICT`,
      "CREATE INDEX history_records_updated_at_idx ON history_records(updated_at DESC)",
      "CREATE INDEX history_records_status_category_idx ON history_records(history_status, category)",
      "CREATE INDEX history_identity_record_idx ON history_identity_keys(record_id)",
    ],
  },
];
