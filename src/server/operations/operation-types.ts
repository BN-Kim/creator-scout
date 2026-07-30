import type { AutomaticScoutingRunResult } from "@/server/scouting/automatic-scouting-types";

export type OperationTrigger = "manual" | "scheduled" | "recovery";
export type OperationExecutionStatus = "running" | "succeeded" | "failed" | "interrupted" | "skipped_locked" | "skipped_paused";
export type OperationEventLevel = "info" | "warn" | "error";

export interface AutomaticRunConfiguration {
  name: string;
  discoveryMode: "automatic" | "manual_replace" | "manual_extend";
  category: string;
  keywords: string;
  targetRecommendedCount: number;
  maximumDaysSinceLatestUpload: number;
  minimumRecentAverageViews: number;
  minimumRecentVideoCount: number;
  allowedCategories?: string[];
}

export interface ScheduledScoutingJob {
  id: string;
  name: string;
  enabled: boolean;
  intervalMinutes: number;
  request: AutomaticRunConfiguration;
  nextRunAt: string;
  lastRunAt: string | null;
  consecutiveFailures: number;
  maxRetries: number;
  createdAt: string;
  updatedAt: string;
}

export interface OperationLease {
  lockKey: string;
  ownerId: string;
  correlationId: string;
  acquiredAt: string;
  expiresAt: string;
}

export interface ScoutingRunExecution {
  id: string;
  correlationId: string;
  jobId: string | null;
  trigger: OperationTrigger;
  status: OperationExecutionStatus;
  attemptCount: number;
  runId: string | null;
  stopReason: string | null;
  priorHistorySkipped: number;
  failedCandidates: number;
  errorCategory: string | null;
  startedAt: string;
  completedAt: string | null;
  updatedAt: string;
}

export interface OperationalEvent {
  id: string;
  correlationId: string;
  executionId: string | null;
  eventType: string;
  level: OperationEventLevel;
  message: string;
  metadata: Record<string, string | number | boolean | null>;
  createdAt: string;
}

export interface OperationControlState {
  paused: boolean;
  reason: string | null;
  updatedAt: string;
}

export interface OperationMonitoringSnapshot {
  control: OperationControlState;
  dueJobs: number;
  enabledJobs: number;
  runningExecutions: number;
  succeededExecutions: number;
  failedExecutions: number;
  interruptedExecutions: number;
  lockConflicts: number;
  priorHistorySkipped: number;
  failedCandidates: number;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
}

export interface OperationsSnapshot {
  monitoring: OperationMonitoringSnapshot;
  schedules: ScheduledScoutingJob[];
  executions: ScoutingRunExecution[];
  events: OperationalEvent[];
  availableRunIds: string[];
}

export interface CoordinatedRunOutcome {
  kind: "completed" | "locked" | "paused" | "failed";
  correlationId: string;
  executionId: string;
  result: AutomaticScoutingRunResult | null;
  errorCategory: string | null;
}
