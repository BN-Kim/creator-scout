import type {
  DiscoveryQueryDefinition,
  DiscoveryQueryDelta,
  DiscoveryQueryState,
  LearnedDiscoveryTerm,
  LearnedTermSource,
} from "@/server/discovery/discovery-types";

export interface DiscoveryStateRepository {
  ensureQueries(queries: readonly DiscoveryQueryDefinition[], now: string): void;
  listQueries(): DiscoveryQueryState[];
  recordPage(key: string, continuationToken: string | null, exhausted: boolean, delta: DiscoveryQueryDelta, now: string): void;
  setCooldown(key: string, cooldownUntil: string | null, exhausted: boolean, now: string): void;
  upsertLearnedTerms(phrases: readonly string[], category: string, source: LearnedTermSource, now: string): void;
  recordLearnedTermOutcome(key: string, delta: DiscoveryQueryDelta, now: string): void;
  listLearnedTerms(): LearnedDiscoveryTerm[];
}
