import { randomUUID } from "node:crypto";
import type { OperationConfig } from "@/server/operations/operation-config";
import { OperationLogger } from "@/server/operations/operation-logger";
import type { OperationRepository } from "@/server/operations/operation-repository";
import type {
  AutomaticRunConfiguration,
  BackgroundRunStart,
  CoordinatedRunOutcome,
  OperationTrigger,
  ScheduledScoutingJob,
  ScoutingRunExecution,
} from "@/server/operations/operation-types";
import { nextScheduledAt, retryDelayMs, waitForStartRateLimit } from "@/server/operations/operation-timing";
import { YouTubeProviderError } from "@/server/providers/youtube/provider-error";
import type { AutomaticScoutingRunResult } from "@/server/scouting/automatic-scouting-types";

export const automaticScoutingLockKey = "automatic-scouting";

export interface OperationCoordinatorDependencies {
  repository: OperationRepository;
  config: OperationConfig;
  executeRun: (configuration: AutomaticRunConfiguration, runId: string) => Promise<AutomaticScoutingRunResult>;
  logger?: OperationLogger;
  now?: () => Date;
  sleep?: (durationMs: number) => Promise<void>;
  createId?: () => string;
  ownerId?: string;
}

export class OperationCoordinator {
  private readonly logger: OperationLogger;
  private readonly now: () => Date;
  private readonly sleep: (durationMs: number) => Promise<void>;
  private readonly createId: () => string;
  private readonly ownerId: string;

  constructor(private readonly dependencies: OperationCoordinatorDependencies) {
    this.now = dependencies.now ?? (() => new Date());
    this.sleep = dependencies.sleep ?? ((durationMs) => new Promise((resolve) => setTimeout(resolve, durationMs)));
    this.createId = dependencies.createId ?? randomUUID;
    this.ownerId = dependencies.ownerId ?? `process-${process.pid}-${this.createId()}`;
    this.logger = dependencies.logger ?? new OperationLogger(dependencies.repository, this.now, undefined, this.createId);
  }

  async executeManual(configuration: AutomaticRunConfiguration): Promise<CoordinatedRunOutcome> {
    return this.execute(configuration, { trigger: "manual", jobId: null, maxRetries: 0 }, this.createExecutionIds());
  }

  startManualInBackground(configuration: AutomaticRunConfiguration): BackgroundRunStart {
    const identifiers = this.createExecutionIds();
    void this.execute(
      configuration,
      { trigger: "manual", jobId: null, maxRetries: 0 },
      identifiers,
    ).catch((error: unknown) => {
      this.logger.log({
        correlationId: identifiers.correlationId,
        executionId: identifiers.executionId,
        eventType: "background_run_start_failed",
        level: "error",
        message: "백그라운드 자동 스카우팅 실행을 시작하지 못했습니다.",
        metadata: { reason: error instanceof Error ? error.name : "unknown" },
      });
    });
    return identifiers;
  }

  async executeScheduled(job: ScheduledScoutingJob, trigger: Extract<OperationTrigger, "scheduled" | "recovery"> = "scheduled"): Promise<CoordinatedRunOutcome> {
    const outcome = await this.execute(job.request, { trigger, jobId: job.id, maxRetries: job.maxRetries }, this.createExecutionIds());
    if (outcome.kind !== "locked" && outcome.kind !== "paused") {
      const now = this.now();
      this.dependencies.repository.updateScheduleAfterRun(job.id, {
        succeeded: outcome.kind === "completed",
        lastRunAt: now.toISOString(),
        nextRunAt: nextScheduledAt(job.nextRunAt, job.intervalMinutes, now),
        now: now.toISOString(),
      });
    }
    return outcome;
  }

  async recoverInterruptedExecutions(): Promise<string[]> {
    const now = this.now().toISOString();
    this.dependencies.repository.deleteExpiredLeases(now);
    const interrupted = this.dependencies.repository.markInterruptedExecutions(now);
    const recoveredJobIds: string[] = [];
    for (const execution of interrupted) {
      this.logger.log({
        correlationId: execution.correlationId, executionId: execution.id, eventType: "run_interrupted",
        level: "warn", message: "만료된 실행을 중단 상태로 복구했습니다.", metadata: { jobId: execution.jobId },
      });
      if (!execution.jobId || recoveredJobIds.includes(execution.jobId)) continue;
      const job = this.dependencies.repository.listSchedules().find((candidate) => candidate.id === execution.jobId);
      if (!job || !job.enabled) continue;
      recoveredJobIds.push(job.id);
      await this.executeScheduled(job, "recovery");
    }
    return recoveredJobIds;
  }

  private async execute(
    configuration: AutomaticRunConfiguration,
    input: { trigger: OperationTrigger; jobId: string | null; maxRetries: number },
    identifiers: BackgroundRunStart,
  ): Promise<CoordinatedRunOutcome> {
    const { correlationId, executionId, runId } = identifiers;

    if (this.dependencies.repository.getControlState().paused) {
      const execution = this.createSkippedExecution(executionId, correlationId, input, "skipped_paused");
      this.dependencies.repository.createExecution(execution);
      this.logger.log({ correlationId, executionId, eventType: "run_skipped_paused", level: "warn", message: "운영 중지 상태여서 실행하지 않았습니다.", metadata: { trigger: input.trigger } });
      return { kind: "paused", correlationId, executionId, result: null, errorCategory: null };
    }

    const lastStartedAt = this.dependencies.repository.listExecutions(100)
      .find((execution) => !execution.status.startsWith("skipped_"))?.startedAt ?? null;
    const waited = await waitForStartRateLimit(lastStartedAt, this.dependencies.config.minimumRunStartIntervalMs, this.now, this.sleep);
    if (waited > 0) {
      this.logger.log({ correlationId, eventType: "run_rate_limited", level: "info", message: "실행 시작 간격을 적용했습니다.", metadata: { retryDelayMs: waited } });
    }
    if (this.dependencies.repository.getControlState().paused) {
      const execution = this.createSkippedExecution(executionId, correlationId, input, "skipped_paused");
      this.dependencies.repository.createExecution(execution);
      return { kind: "paused", correlationId, executionId, result: null, errorCategory: null };
    }

    const acquiredAt = this.now();
    const acquired = this.dependencies.repository.tryAcquireLease({
      lockKey: automaticScoutingLockKey, ownerId: this.ownerId, correlationId,
      acquiredAt: acquiredAt.toISOString(), expiresAt: new Date(acquiredAt.getTime() + this.dependencies.config.leaseDurationMs).toISOString(),
    });
    if (!acquired) {
      const execution = this.createSkippedExecution(executionId, correlationId, input, "skipped_locked");
      this.dependencies.repository.createExecution(execution);
      this.logger.log({ correlationId, executionId, eventType: "run_skipped_locked", level: "warn", message: "다른 실행이 잠금을 보유하고 있어 건너뛰었습니다.", metadata: { lockKey: automaticScoutingLockKey, trigger: input.trigger } });
      return { kind: "locked", correlationId, executionId, result: null, errorCategory: null };
    }

    let execution: ScoutingRunExecution = {
      id: executionId, correlationId, jobId: input.jobId, trigger: input.trigger, status: "running", attemptCount: 0,
      runId, stopReason: null, priorHistorySkipped: 0, failedCandidates: 0, errorCategory: null,
      startedAt: acquiredAt.toISOString(), completedAt: null, updatedAt: acquiredAt.toISOString(),
    };
    this.dependencies.repository.createExecution(execution);
    this.logger.log({ correlationId, executionId, eventType: "run_started", level: "info", message: "자동 스카우팅 실행을 시작했습니다.", metadata: { trigger: input.trigger, jobId: input.jobId, targetRecommendedCount: configuration.targetRecommendedCount } });

    try {
      for (let attempt = 1; attempt <= input.maxRetries + 1; attempt += 1) {
        execution = { ...execution, attemptCount: attempt, updatedAt: this.now().toISOString() };
        this.dependencies.repository.updateExecution(execution);
        try {
          const renewed = this.dependencies.repository.renewLease(
            automaticScoutingLockKey, this.ownerId, new Date(this.now().getTime() + this.dependencies.config.leaseDurationMs).toISOString(),
          );
          if (!renewed) throw new OperationLeaseLostError();
          const result = await this.dependencies.executeRun(configuration, runId);
          const completedAt = this.now().toISOString();
          execution = {
            ...execution, status: "succeeded", runId: result.runId, stopReason: result.statistics.stopReason,
            priorHistorySkipped: result.statistics.priorHistorySkipped, failedCandidates: result.statistics.failed,
            completedAt, updatedAt: completedAt,
          };
          this.dependencies.repository.updateExecution(execution);
          this.logger.log({
            correlationId, executionId, eventType: "run_succeeded", level: "info", message: "자동 스카우팅 실행을 완료했습니다.",
            metadata: { status: result.status, stopReason: result.statistics.stopReason, priorHistorySkipped: result.statistics.priorHistorySkipped,
              failedCandidates: result.statistics.failed, targetRecommendedCount: result.statistics.targetRecommendedCount,
              recommendationsFilled: result.statistics.recommendationsFilled },
          });
          return { kind: "completed", correlationId, executionId, result, errorCategory: null };
        } catch (error: unknown) {
          const retryable = isRetryableOperationError(error);
          if (retryable && attempt <= input.maxRetries) {
            const delay = retryDelayMs(this.dependencies.config.retryBaseDelayMs, attempt);
            this.logger.log({ correlationId, executionId, eventType: "run_retry_scheduled", level: "warn", message: "제한된 재시도를 예약했습니다.", metadata: { attempt, retryDelayMs: delay } });
            await this.sleep(delay);
            continue;
          }
          const completedAt = this.now().toISOString();
          execution = { ...execution, status: "failed", errorCategory: operationErrorCategory(error), completedAt, updatedAt: completedAt };
          this.dependencies.repository.updateExecution(execution);
          this.logger.log({ correlationId, executionId, eventType: "run_failed", level: "error", message: "자동 스카우팅 실행이 실패했습니다.", metadata: { attempt, status: execution.errorCategory } });
          return { kind: "failed", correlationId, executionId, result: null, errorCategory: execution.errorCategory };
        }
      }
      throw new Error("실행 재시도 상태가 올바르지 않습니다.");
    } finally {
      this.dependencies.repository.releaseLease(automaticScoutingLockKey, this.ownerId);
    }
  }

  private createExecutionIds(): BackgroundRunStart {
    return {
      correlationId: `correlation-${this.createId()}`,
      executionId: `execution-${this.createId()}`,
      runId: `automatic-${this.createId()}`,
    };
  }

  private createSkippedExecution(
    id: string,
    correlationId: string,
    input: { trigger: OperationTrigger; jobId: string | null },
    status: Extract<ScoutingRunExecution["status"], "skipped_locked" | "skipped_paused">,
  ): ScoutingRunExecution {
    const now = this.now().toISOString();
    return {
      id, correlationId, jobId: input.jobId, trigger: input.trigger, status, attemptCount: 0, runId: null,
      stopReason: null, priorHistorySkipped: 0, failedCandidates: 0, errorCategory: null,
      startedAt: now, completedAt: now, updatedAt: now,
    };
  }
}

function isRetryableOperationError(error: unknown): boolean {
  if (error instanceof YouTubeProviderError) return error.retryable;
  return typeof error === "object" && error !== null && "retryable" in error && (error as { retryable?: unknown }).retryable === true;
}

function operationErrorCategory(error: unknown): string {
  if (error instanceof YouTubeProviderError) return error.category;
  if (error instanceof OperationLeaseLostError) return "lock_lost";
  return isRetryableOperationError(error) ? "temporary" : "internal";
}

class OperationLeaseLostError extends Error {
  constructor() { super("실행 잠금 소유권을 확인할 수 없습니다."); }
}
