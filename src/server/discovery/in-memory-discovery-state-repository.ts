import type { DiscoveryStateRepository } from "@/server/discovery/discovery-state-repository";
import type { DiscoveryQueryDefinition, DiscoveryQueryDelta, DiscoveryQueryState, LearnedDiscoveryTerm, LearnedTermSource } from "@/server/discovery/discovery-types";
import { normalizeDiscoveryQuery } from "@/server/discovery/discovery-taxonomy";

export class InMemoryDiscoveryStateRepository implements DiscoveryStateRepository {
  private readonly queries = new Map<string, DiscoveryQueryState>();
  private readonly terms = new Map<string, LearnedDiscoveryTerm>();

  ensureQueries(queries: readonly DiscoveryQueryDefinition[], now: string): void {
    for (const query of queries) {
      if (this.queries.has(query.normalizedKey)) continue;
      this.queries.set(query.normalizedKey, {
        ...query, continuationToken: null, attempts: 0, pagesScanned: 0, candidatesScanned: 0,
        newIdentities: 0, duplicates: 0, recommended: 0, hold: 0, excluded: 0, failed: 0,
        categoryMatches: 0, koreanActivityMatches: 0, personalContacts: 0,
        lastAttemptedAt: null, cooldownUntil: null, exhausted: false, createdAt: now, updatedAt: now,
      });
    }
  }

  listQueries(): DiscoveryQueryState[] { return [...this.queries.values()].map((state) => ({ ...state })); }

  recordPage(key: string, continuationToken: string | null, exhausted: boolean, delta: DiscoveryQueryDelta, now: string): void {
    const state = this.queries.get(key);
    if (!state) throw new Error("발견 쿼리 상태를 찾을 수 없습니다.");
    this.queries.set(key, {
      ...state, continuationToken, exhausted, attempts: state.attempts + 1, pagesScanned: state.pagesScanned + 1,
      candidatesScanned: state.candidatesScanned + (delta.candidatesScanned ?? 0),
      newIdentities: state.newIdentities + (delta.newIdentities ?? 0), duplicates: state.duplicates + (delta.duplicates ?? 0),
      recommended: state.recommended + (delta.recommended ?? 0), hold: state.hold + (delta.hold ?? 0),
      excluded: state.excluded + (delta.excluded ?? 0), failed: state.failed + (delta.failed ?? 0),
      categoryMatches: state.categoryMatches + (delta.categoryMatches ?? 0),
      koreanActivityMatches: state.koreanActivityMatches + (delta.koreanActivityMatches ?? 0),
      personalContacts: state.personalContacts + (delta.personalContacts ?? 0), lastAttemptedAt: now, updatedAt: now,
    });
  }

  setCooldown(key: string, cooldownUntil: string | null, exhausted: boolean, now: string): void {
    const state = this.queries.get(key);
    if (state) this.queries.set(key, { ...state, cooldownUntil, exhausted, updatedAt: now });
  }

  upsertLearnedTerms(phrases: readonly string[], category: string, source: LearnedTermSource, now: string): void {
    for (const phrase of phrases) {
      const key = normalizeDiscoveryQuery(phrase);
      const current = this.terms.get(key);
      this.terms.set(key, current ? {
        ...current,
      } : {
        phrase, normalizedKey: key, category, sampleCount: 0, recommendedCount: 0, duplicateCount: 0,
        excludedCount: 0, failedCount: 0, state: "exploratory", cooldownUntil: null,
        sourceChannelId: source.channelId, sourcePublicUrl: source.publicUrl, sourceEvidence: [...source.evidence],
        createdAt: now, updatedAt: now,
      });
    }
  }

  recordLearnedTermOutcome(key: string, delta: DiscoveryQueryDelta, now: string): void {
    const current = this.terms.get(key);
    if (!current) return;
    const sampleCount = current.sampleCount + (delta.candidatesScanned ?? 0);
    const recommendedCount = current.recommendedCount + (delta.recommended ?? 0);
    const duplicateCount = current.duplicateCount + (delta.duplicates ?? 0);
    const excludedCount = current.excludedCount + (delta.excluded ?? 0);
    const failedCount = current.failedCount + (delta.failed ?? 0);
    const unhealthy = sampleCount >= 10 && (duplicateCount / sampleCount >= 0.7 || excludedCount / sampleCount >= 0.7 || failedCount / sampleCount >= 0.5);
    const state = unhealthy ? (sampleCount >= 30 ? "retired" : "cooldown") : sampleCount >= 10 && recommendedCount / sampleCount >= 0.15 ? "proven" : "exploratory";
    this.terms.set(key, { ...current, sampleCount, recommendedCount, duplicateCount, excludedCount, failedCount, state,
      cooldownUntil: state === "cooldown" ? new Date(Date.parse(now) + 7 * 24 * 60 * 60_000).toISOString() : null, updatedAt: now });
  }

  listLearnedTerms(): LearnedDiscoveryTerm[] { return [...this.terms.values()].map((term) => ({ ...term })); }
}
