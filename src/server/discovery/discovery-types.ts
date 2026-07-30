export type DiscoveryMode = "automatic" | "manual_replace" | "manual_extend";
export type DiscoveryScope = "narrow" | "medium" | "broad";
export type DiscoveryQueryOrigin = "taxonomy" | "manual" | "learned";
export type LearnedTermState = "exploratory" | "proven" | "cooldown" | "retired";

export interface DiscoveryQueryDefinition {
  query: string;
  normalizedKey: string;
  category: string;
  scope: DiscoveryScope;
  origin: DiscoveryQueryOrigin;
}

export interface DiscoveryQueryState extends DiscoveryQueryDefinition {
  continuationToken: string | null;
  attempts: number;
  pagesScanned: number;
  candidatesScanned: number;
  newIdentities: number;
  duplicates: number;
  recommended: number;
  hold: number;
  excluded: number;
  failed: number;
  categoryMatches: number;
  koreanActivityMatches: number;
  personalContacts: number;
  lastAttemptedAt: string | null;
  cooldownUntil: string | null;
  exhausted: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DiscoveryQueryDelta {
  candidatesScanned?: number;
  newIdentities?: number;
  duplicates?: number;
  recommended?: number;
  hold?: number;
  excluded?: number;
  failed?: number;
  categoryMatches?: number;
  koreanActivityMatches?: number;
  personalContacts?: number;
}

export interface LearnedDiscoveryTerm {
  phrase: string;
  normalizedKey: string;
  category: string;
  sampleCount: number;
  recommendedCount: number;
  duplicateCount: number;
  excludedCount: number;
  failedCount: number;
  state: LearnedTermState;
  cooldownUntil: string | null;
  sourceChannelId: string | null;
  sourcePublicUrl: string | null;
  sourceEvidence: string[];
  createdAt: string;
  updatedAt: string;
}

export interface LearnedTermSource {
  channelId: string;
  publicUrl: string;
  evidence: string[];
}

export interface QueryQualityScore {
  score: number;
  sampleSize: number;
  proven: boolean;
}
