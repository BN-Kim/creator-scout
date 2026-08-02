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
  {
    version: 3,
    name: "create_operational_scheduler",
    statements: [
      `CREATE TABLE operation_control (
        singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
        paused INTEGER NOT NULL CHECK (paused IN (0, 1)),
        reason TEXT,
        updated_at TEXT NOT NULL
      ) STRICT`,
      "INSERT INTO operation_control (singleton_id, paused, reason, updated_at) VALUES (1, 0, NULL, '1970-01-01T00:00:00.000Z')",
      `CREATE TABLE scheduled_scouting_jobs (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
        interval_minutes INTEGER NOT NULL CHECK (interval_minutes >= 1),
        request_json TEXT NOT NULL,
        next_run_at TEXT NOT NULL,
        last_run_at TEXT,
        consecutive_failures INTEGER NOT NULL DEFAULT 0,
        max_retries INTEGER NOT NULL CHECK (max_retries >= 0),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      ) STRICT`,
      `CREATE TABLE operation_leases (
        lock_key TEXT PRIMARY KEY,
        owner_id TEXT NOT NULL,
        correlation_id TEXT NOT NULL,
        acquired_at TEXT NOT NULL,
        expires_at TEXT NOT NULL
      ) STRICT`,
      `CREATE TABLE scouting_run_executions (
        id TEXT PRIMARY KEY,
        correlation_id TEXT NOT NULL UNIQUE,
        job_id TEXT REFERENCES scheduled_scouting_jobs(id) ON DELETE SET NULL,
        trigger_type TEXT NOT NULL CHECK (trigger_type IN ('manual', 'scheduled', 'recovery')),
        status TEXT NOT NULL CHECK (status IN ('running', 'succeeded', 'failed', 'interrupted', 'skipped_locked', 'skipped_paused')),
        attempt_count INTEGER NOT NULL DEFAULT 0,
        run_id TEXT,
        stop_reason TEXT,
        prior_history_skipped INTEGER NOT NULL DEFAULT 0,
        failed_candidates INTEGER NOT NULL DEFAULT 0,
        error_category TEXT,
        started_at TEXT NOT NULL,
        completed_at TEXT,
        updated_at TEXT NOT NULL
      ) STRICT`,
      `CREATE TABLE operational_events (
        id TEXT PRIMARY KEY,
        correlation_id TEXT NOT NULL,
        execution_id TEXT,
        event_type TEXT NOT NULL,
        level TEXT NOT NULL CHECK (level IN ('info', 'warn', 'error')),
        message TEXT NOT NULL,
        metadata_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      ) STRICT`,
      "CREATE INDEX scheduled_jobs_due_idx ON scheduled_scouting_jobs(enabled, next_run_at)",
      "CREATE INDEX executions_status_updated_idx ON scouting_run_executions(status, updated_at DESC)",
      "CREATE INDEX executions_correlation_idx ON scouting_run_executions(correlation_id)",
      "CREATE INDEX operational_events_created_idx ON operational_events(created_at DESC)",
      "CREATE INDEX operational_events_correlation_idx ON operational_events(correlation_id, created_at)",
    ],
  },
  {
    version: 4,
    name: "persist_automatic_run_results",
    statements: [
      `CREATE TABLE automatic_scouting_run_results (
        run_id TEXT PRIMARY KEY,
        result_json TEXT NOT NULL,
        started_at TEXT NOT NULL,
        completed_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      ) STRICT`,
      "CREATE INDEX automatic_run_results_completed_idx ON automatic_scouting_run_results(completed_at DESC)",
    ],
  },
  {
    version: 5,
    name: "add_learned_term_provenance",
    statements: [
      "ALTER TABLE discovery_learned_terms ADD COLUMN source_channel_id TEXT",
      "ALTER TABLE discovery_learned_terms ADD COLUMN source_public_url TEXT",
      "ALTER TABLE discovery_learned_terms ADD COLUMN source_evidence_json TEXT NOT NULL DEFAULT '[]'",
      "CREATE INDEX discovery_learned_source_idx ON discovery_learned_terms(source_channel_id)",
    ],
  },
  {
    version: 6,
    name: "add_marketing_fit_history_fields",
    statements: [
      "ALTER TABLE history_records ADD COLUMN fit_score INTEGER CHECK (fit_score IS NULL OR (fit_score >= 0 AND fit_score <= 100))",
      "ALTER TABLE history_records ADD COLUMN score_components_json TEXT",
      "ALTER TABLE history_records ADD COLUMN contact_ready INTEGER CHECK (contact_ready IS NULL OR contact_ready IN (0, 1))",
      "ALTER TABLE history_records ADD COLUMN rule_version TEXT NOT NULL DEFAULT 'legacy'",
      "ALTER TABLE history_records ADD COLUMN recheck_at TEXT",
      "ALTER TABLE history_records ADD COLUMN applied_settings_json TEXT",
      "ALTER TABLE history_records ADD COLUMN decision_source TEXT NOT NULL DEFAULT 'system' CHECK (decision_source IN ('system', 'manual'))",
      "CREATE INDEX history_records_recheck_idx ON history_records(recheck_at, rule_version)",
      "CREATE INDEX history_records_fit_score_idx ON history_records(fit_score DESC)",
    ],
  },
  {
    version: 7,
    name: "create_manual_decision_audit",
    statements: [
      `CREATE TABLE creator_decision_audit (
        id TEXT PRIMARY KEY,
        history_record_id TEXT NOT NULL REFERENCES history_records(id) ON DELETE CASCADE,
        run_id TEXT NOT NULL,
        creator_internal_id TEXT NOT NULL,
        previous_decision TEXT NOT NULL CHECK (previous_decision IN ('recommended', 'hold', 'excluded')),
        next_decision TEXT NOT NULL CHECK (next_decision IN ('recommended', 'hold', 'excluded')),
        reason_code TEXT NOT NULL CHECK (reason_code IN ('marketer_fit', 'contact_verified', 'campaign_mismatch', 'insufficient_evidence', 'do_not_contact', 'duplicate_or_invalid', 'other')),
        note TEXT NOT NULL,
        actor TEXT NOT NULL,
        changed_at TEXT NOT NULL
      ) STRICT`,
      "CREATE INDEX creator_decision_audit_history_idx ON creator_decision_audit(history_record_id, changed_at DESC)",
      "CREATE INDEX creator_decision_audit_run_idx ON creator_decision_audit(run_id, changed_at DESC)",
    ],
  },
  {
    version: 8,
    name: "create_marketing_outcomes",
    statements: [
      `CREATE TABLE marketing_outcome_events (
        id TEXT PRIMARY KEY,
        history_record_id TEXT NOT NULL REFERENCES history_records(id) ON DELETE CASCADE,
        run_id TEXT NOT NULL,
        outcome_type TEXT NOT NULL CHECK (outcome_type IN ('marketer_approved', 'contact_attempted', 'replied', 'meeting', 'contracted', 'content_published', 'campaign_performance')),
        occurred_at TEXT NOT NULL,
        note TEXT NOT NULL,
        content_url TEXT,
        views INTEGER CHECK (views IS NULL OR views >= 0),
        likes INTEGER CHECK (likes IS NULL OR likes >= 0),
        comments INTEGER CHECK (comments IS NULL OR comments >= 0),
        conversions INTEGER CHECK (conversions IS NULL OR conversions >= 0),
        revenue_krw INTEGER CHECK (revenue_krw IS NULL OR revenue_krw >= 0),
        created_at TEXT NOT NULL
      ) STRICT`,
      "CREATE INDEX marketing_outcomes_history_idx ON marketing_outcome_events(history_record_id, occurred_at DESC)",
      "CREATE INDEX marketing_outcomes_type_idx ON marketing_outcome_events(outcome_type, occurred_at DESC)",
      "CREATE INDEX marketing_outcomes_run_idx ON marketing_outcome_events(run_id, occurred_at DESC)",
    ],
  },
];
