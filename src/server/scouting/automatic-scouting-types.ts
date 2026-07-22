import type { EvaluatedCreator, RecommendationSettings } from "@/types/domain";

export interface AutomaticScoutingRunRequest {
  runId: string;
  query: string;
  category: string;
  targetCount: number;
  recentVideoLimit?: number;
  settings: RecommendationSettings;
}

export interface AutomaticScoutingStatistics {
  discovered: number;
  skippedDuplicates: number;
  skippedPriorHistory: number;
  skippedSameRun: number;
  evaluated: number;
  recommended: number;
  hold: number;
  excluded: number;
  failed: number;
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
