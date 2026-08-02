import type { EvaluatedCreator, RecommendationSettings } from "@/types/domain";
import type { DiscoveryMode, DiscoveryQueryState } from "@/server/discovery/discovery-types";
import type { CandidateDiscoveryStrategy } from "@/server/providers/youtube/provider-types";

export interface AutomaticScoutingRunRequest {
  runId: string;
  discoveryMode?: DiscoveryMode;
  manualQueries?: string[];
  preferredCategory?: string;
  /** Backward-compatible single-query input for existing H4 fixtures. */
  query?: string;
  /** Backward-compatible category input for existing H4 fixtures. */
  category?: string;
  targetRecommendedCount: number;
  recentVideoLimit?: number;
  safetyLimits?: Partial<AutomaticScoutingSafetyLimits>;
  settings: RecommendationSettings;
}

export interface AutomaticScoutingSafetyLimits {
  maxScannedCandidates: number;
  maxDiscoveryPages: number;
  maxRunDurationMs: number;
  maxProviderFailures: number;
}

export type AutomaticScoutingStopReason =
  | "target_reached"
  | "source_exhausted"
  | "candidate_limit_reached"
  | "page_limit_reached"
  | "time_limit_reached"
  | "provider_failure_limit_reached";

export interface AutomaticScoutingStatistics {
  discoveryMode: DiscoveryMode;
  queriesAttempted: number;
  pagesScanned: number;
  targetRecommendedCount: number;
  recommendationsFilled: number;
  discovered: number;
  priorHistorySkipped: number;
  historyReevaluated: number;
  manualOverrideSkipped: number;
  sameRunDuplicatesSkipped: number;
  evaluated: number;
  recommended: number;
  hold: number;
  excluded: number;
  failed: number;
  stopReason: AutomaticScoutingStopReason;
}

export interface AutomaticScoutingRequestSnapshot {
  discoveryMode: DiscoveryMode;
  manualQueries: string[];
  preferredCategory: string | null;
  targetRecommendedCount: number;
  recentVideoLimit: number | null;
  safetyLimits: AutomaticScoutingSafetyLimits;
  settings: RecommendationSettings;
  ruleVersion: string;
}

export interface AutomaticScoutingQueryAttempt {
  order: number;
  query: string;
  normalizedKey: string;
  category: string;
  scope: DiscoveryQueryState["scope"];
  origin: DiscoveryQueryState["origin"];
  strategy: CandidateDiscoveryStrategy;
}

export interface AutomaticScoutingDecisionBreakdown {
  evaluated: number;
  staticEligible: number;
  scoreQualified: number;
  contactReady: number;
  recommended: number;
  hold: number;
  excluded: number;
}

export interface AutomaticScoutingDiagnostics {
  funnel: AutomaticScoutingDecisionBreakdown;
  querySequence: AutomaticScoutingQueryAttempt[];
  byCategory: Record<string, AutomaticScoutingDecisionBreakdown>;
  byQuery: Record<string, AutomaticScoutingDecisionBreakdown>;
}

export type AutomaticScoutingFailureStage =
  | "discovery"
  | "identity_resolution"
  | "history_precheck"
  | "evidence_collection"
  | "recruitment_evidence"
  | "input_mapping"
  | "evaluation"
  | "persistence";

export interface AutomaticScoutingFailure {
  stage: AutomaticScoutingFailureStage;
  candidateChannelId: string | null;
  category: string;
  retryable: boolean;
  message: string;
}

export interface AutomaticScoutingSkip {
  channelId: string;
  reason: "prior_history" | "same_run";
  matchedHistoryRecordId: string | null;
}

export interface AutomaticScoutingRunResult {
  runId: string;
  runKind: "discovery" | "reevaluation";
  sourceRunId: string | null;
  status: "completed" | "completed_with_failures";
  startedAt: string;
  completedAt: string;
  statistics: AutomaticScoutingStatistics;
  results: EvaluatedCreator[];
  skips: AutomaticScoutingSkip[];
  failures: AutomaticScoutingFailure[];
  requestSnapshot: AutomaticScoutingRequestSnapshot | null;
  diagnostics: AutomaticScoutingDiagnostics;
}
