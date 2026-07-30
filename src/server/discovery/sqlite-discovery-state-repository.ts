import type { SqliteDatabase } from "@/server/database/database";
import type { DiscoveryStateRepository } from "@/server/discovery/discovery-state-repository";
import type { DiscoveryQueryDefinition, DiscoveryQueryDelta, DiscoveryQueryState, LearnedDiscoveryTerm, LearnedTermSource } from "@/server/discovery/discovery-types";
import { normalizeDiscoveryQuery } from "@/server/discovery/discovery-taxonomy";

interface QueryRow {
  normalized_key: string; query_text: string; category: string; scope: DiscoveryQueryState["scope"]; origin: DiscoveryQueryState["origin"];
  continuation_token: string | null; attempts: number; pages_scanned: number; candidates_scanned: number; new_identities: number;
  duplicates: number; recommended: number; hold: number; excluded: number; failed: number; category_matches: number;
  korean_activity_matches: number; personal_contacts: number; last_attempted_at: string | null; cooldown_until: string | null;
  exhausted: number; created_at: string; updated_at: string;
}

interface LearnedRow {
  normalized_key: string; phrase: string; category: string; sample_count: number; recommended_count: number;
  duplicate_count: number; excluded_count: number; failed_count: number; state: LearnedDiscoveryTerm["state"];
  cooldown_until: string | null; source_channel_id: string | null; source_public_url: string | null;
  source_evidence_json: string; created_at: string; updated_at: string;
}

export class SqliteDiscoveryStateRepository implements DiscoveryStateRepository {
  constructor(private readonly database: SqliteDatabase) {}

  ensureQueries(queries: readonly DiscoveryQueryDefinition[], now: string): void {
    const insert = this.database.prepare(`INSERT OR IGNORE INTO discovery_query_state
      (normalized_key, query_text, category, scope, origin, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`);
    this.database.transaction(() => {
      for (const query of queries) insert.run(query.normalizedKey, query.query, query.category, query.scope, query.origin, now, now);
    })();
  }

  listQueries(): DiscoveryQueryState[] {
    return (this.database.prepare("SELECT * FROM discovery_query_state").all() as QueryRow[]).map(toQueryState);
  }

  recordPage(key: string, continuationToken: string | null, exhausted: boolean, delta: DiscoveryQueryDelta, now: string): void {
    const result = this.database.prepare(`UPDATE discovery_query_state SET
      continuation_token = ?, exhausted = ?, attempts = attempts + 1, pages_scanned = pages_scanned + 1,
      candidates_scanned = candidates_scanned + ?, new_identities = new_identities + ?, duplicates = duplicates + ?,
      recommended = recommended + ?, hold = hold + ?, excluded = excluded + ?, failed = failed + ?,
      category_matches = category_matches + ?, korean_activity_matches = korean_activity_matches + ?,
      personal_contacts = personal_contacts + ?, last_attempted_at = ?, updated_at = ? WHERE normalized_key = ?`).run(
      continuationToken, exhausted ? 1 : 0, delta.candidatesScanned ?? 0, delta.newIdentities ?? 0,
      delta.duplicates ?? 0, delta.recommended ?? 0, delta.hold ?? 0, delta.excluded ?? 0, delta.failed ?? 0,
      delta.categoryMatches ?? 0, delta.koreanActivityMatches ?? 0, delta.personalContacts ?? 0, now, now, key,
    );
    if (result.changes !== 1) throw new Error("발견 쿼리 상태를 찾을 수 없습니다.");
  }

  setCooldown(key: string, cooldownUntil: string | null, exhausted: boolean, now: string): void {
    this.database.prepare("UPDATE discovery_query_state SET cooldown_until = ?, exhausted = ?, updated_at = ? WHERE normalized_key = ?")
      .run(cooldownUntil, exhausted ? 1 : 0, now, key);
  }

  upsertLearnedTerms(phrases: readonly string[], category: string, source: LearnedTermSource, now: string): void {
    const statement = this.database.prepare(`INSERT INTO discovery_learned_terms
      (normalized_key, phrase, category, sample_count, recommended_count, state,
       source_channel_id, source_public_url, source_evidence_json, created_at, updated_at)
      VALUES (?, ?, ?, 0, 0, 'exploratory', ?, ?, ?, ?, ?)
      ON CONFLICT(normalized_key) DO NOTHING`);
    this.database.transaction(() => {
      for (const phrase of phrases) statement.run(
        normalizeDiscoveryQuery(phrase),
        phrase,
        category,
        source.channelId,
        source.publicUrl,
        JSON.stringify(source.evidence),
        now,
        now,
      );
    })();
  }

  recordLearnedTermOutcome(key: string, delta: DiscoveryQueryDelta, now: string): void {
    const current = this.database.prepare("SELECT * FROM discovery_learned_terms WHERE normalized_key = ?").get(key) as LearnedRow | undefined;
    if (!current) return;
    const sampleCount = current.sample_count + (delta.candidatesScanned ?? 0);
    const recommendedCount = current.recommended_count + (delta.recommended ?? 0);
    const duplicateCount = current.duplicate_count + (delta.duplicates ?? 0);
    const excludedCount = current.excluded_count + (delta.excluded ?? 0);
    const failedCount = current.failed_count + (delta.failed ?? 0);
    const next = learnedTermState(sampleCount, recommendedCount, duplicateCount, excludedCount, failedCount, now);
    this.database.prepare(`UPDATE discovery_learned_terms SET sample_count = ?, recommended_count = ?, duplicate_count = ?,
      excluded_count = ?, failed_count = ?, state = ?, cooldown_until = ?, updated_at = ? WHERE normalized_key = ?`).run(
      sampleCount, recommendedCount, duplicateCount, excludedCount, failedCount, next.state, next.cooldownUntil, now, key,
    );
  }

  listLearnedTerms(): LearnedDiscoveryTerm[] {
    return (this.database.prepare("SELECT * FROM discovery_learned_terms").all() as LearnedRow[]).map((row) => ({
      phrase: row.phrase, normalizedKey: row.normalized_key, category: row.category, sampleCount: row.sample_count,
      recommendedCount: row.recommended_count, duplicateCount: row.duplicate_count, excludedCount: row.excluded_count,
      failedCount: row.failed_count, state: row.state, cooldownUntil: row.cooldown_until,
      sourceChannelId: row.source_channel_id, sourcePublicUrl: row.source_public_url,
      sourceEvidence: parseSourceEvidence(row.source_evidence_json),
      createdAt: row.created_at, updatedAt: row.updated_at,
    }));
  }
}

function parseSourceEvidence(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) && parsed.every((item) => typeof item === "string") ? parsed : [];
  } catch {
    return [];
  }
}

function learnedTermState(sample: number, recommended: number, duplicates: number, excluded: number, failed: number, now: string): Pick<LearnedDiscoveryTerm, "state" | "cooldownUntil"> {
  if (sample < 10) return { state: "exploratory", cooldownUntil: null };
  const unhealthy = duplicates / sample >= 0.7 || excluded / sample >= 0.7 || failed / sample >= 0.5;
  if (unhealthy && sample >= 30) return { state: "retired", cooldownUntil: null };
  if (unhealthy) return { state: "cooldown", cooldownUntil: new Date(Date.parse(now) + 7 * 24 * 60 * 60_000).toISOString() };
  if (recommended / sample >= 0.15) return { state: "proven", cooldownUntil: null };
  return { state: "exploratory", cooldownUntil: null };
}

function toQueryState(row: QueryRow): DiscoveryQueryState {
  return {
    query: row.query_text, normalizedKey: row.normalized_key, category: row.category, scope: row.scope, origin: row.origin,
    continuationToken: row.continuation_token, attempts: row.attempts, pagesScanned: row.pages_scanned,
    candidatesScanned: row.candidates_scanned, newIdentities: row.new_identities, duplicates: row.duplicates,
    recommended: row.recommended, hold: row.hold, excluded: row.excluded, failed: row.failed,
    categoryMatches: row.category_matches, koreanActivityMatches: row.korean_activity_matches,
    personalContacts: row.personal_contacts, lastAttemptedAt: row.last_attempted_at, cooldownUntil: row.cooldown_until,
    exhausted: row.exhausted === 1, createdAt: row.created_at, updatedAt: row.updated_at,
  };
}
