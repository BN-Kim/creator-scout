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
  {
    version: 2,
    name: "create_discovery_state",
    statements: [
      `CREATE TABLE discovery_query_state (
        normalized_key TEXT PRIMARY KEY,
        query_text TEXT NOT NULL,
        category TEXT NOT NULL,
        scope TEXT NOT NULL CHECK (scope IN ('narrow', 'medium', 'broad')),
        origin TEXT NOT NULL CHECK (origin IN ('taxonomy', 'manual', 'learned')),
        continuation_token TEXT,
        attempts INTEGER NOT NULL DEFAULT 0,
        pages_scanned INTEGER NOT NULL DEFAULT 0,
        candidates_scanned INTEGER NOT NULL DEFAULT 0,
        new_identities INTEGER NOT NULL DEFAULT 0,
        duplicates INTEGER NOT NULL DEFAULT 0,
        recommended INTEGER NOT NULL DEFAULT 0,
        hold INTEGER NOT NULL DEFAULT 0,
        excluded INTEGER NOT NULL DEFAULT 0,
        failed INTEGER NOT NULL DEFAULT 0,
        category_matches INTEGER NOT NULL DEFAULT 0,
        korean_activity_matches INTEGER NOT NULL DEFAULT 0,
        personal_contacts INTEGER NOT NULL DEFAULT 0,
        last_attempted_at TEXT,
        cooldown_until TEXT,
        exhausted INTEGER NOT NULL DEFAULT 0 CHECK (exhausted IN (0, 1)),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      ) STRICT`,
      `CREATE TABLE discovery_learned_terms (
        normalized_key TEXT PRIMARY KEY,
        phrase TEXT NOT NULL,
        category TEXT NOT NULL,
        sample_count INTEGER NOT NULL DEFAULT 0,
        recommended_count INTEGER NOT NULL DEFAULT 0,
        duplicate_count INTEGER NOT NULL DEFAULT 0,
        excluded_count INTEGER NOT NULL DEFAULT 0,
        failed_count INTEGER NOT NULL DEFAULT 0,
        state TEXT NOT NULL CHECK (state IN ('exploratory', 'proven', 'cooldown', 'retired')),
        cooldown_until TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      ) STRICT`,
      "CREATE INDEX discovery_query_priority_idx ON discovery_query_state(exhausted, cooldown_until, scope, updated_at)",
      "CREATE INDEX discovery_query_category_idx ON discovery_query_state(category, scope)",
      "CREATE INDEX discovery_learned_state_idx ON discovery_learned_terms(state, category)",
    ],
  },
];
