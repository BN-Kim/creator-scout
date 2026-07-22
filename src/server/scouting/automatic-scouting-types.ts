import type { EvaluatedCreator, RecommendationSettings } from "@/types/domain";
import type { DiscoveryMode } from "@/server/discovery/discovery-types";

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
  sameRunDuplicatesSkipped: number;
  evaluated: number;
  recommended: number;
  hold: number;
  excluded: number;
  failed: number;
  stopReason: AutomaticScoutingStopReason;
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
  status: "completed" | "completed_with_failures";
  startedAt: string;
  completedAt: string;
  statistics: AutomaticScoutingStatistics;
  results: EvaluatedCreator[];
  skips: AutomaticScoutingSkip[];
  failures: AutomaticScoutingFailure[];
}
