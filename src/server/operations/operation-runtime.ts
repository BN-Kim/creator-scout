import { randomUUID } from "node:crypto";
import { OperationCoordinator } from "@/server/operations/operation-coordinator";
import { loadOperationConfig } from "@/server/operations/operation-config";
import { OperationLogger } from "@/server/operations/operation-logger";
import { OperationalScheduler } from "@/server/operations/operational-scheduler";
import { getServerOperationRepository } from "@/server/operations/server-operation-repository";
import { executeAutomaticScouting } from "@/server/scouting/automatic-scouting-service";

interface OperationRuntimeState {
  coordinator: OperationCoordinator;
  scheduler: OperationalScheduler;
  timer: ReturnType<typeof setInterval> | null;
}

const globalRuntime = globalThis as typeof globalThis & { creatorOperationRuntime?: OperationRuntimeState };

export function ensureOperationRuntime(): OperationRuntimeState {
  if (globalRuntime.creatorOperationRuntime) return globalRuntime.creatorOperationRuntime;
  const repository = getServerOperationRepository();
  const config = loadOperationConfig();
  const logger = new OperationLogger(repository);
  const coordinator = new OperationCoordinator({ repository, config, executeRun: executeAutomaticScouting, logger });
  const scheduler = new OperationalScheduler(repository, coordinator);
  const timer = config.schedulerEnabled ? startSchedulerTimer(scheduler, logger, config.schedulerPollMs) : null;
  globalRuntime.creatorOperationRuntime = { coordinator, scheduler, timer };
  if (config.schedulerEnabled) {
    void scheduler.tick().catch(() => logger.log({
      correlationId: `scheduler-${randomUUID()}`, eventType: "scheduler_start_failed", level: "error",
      message: "예약 실행기를 시작하지 못했습니다.", metadata: { reason: "internal" },
    }));
  }
  return globalRuntime.creatorOperationRuntime;
}

function startSchedulerTimer(
  scheduler: OperationalScheduler,
  logger: OperationLogger,
  pollMs: number,
): ReturnType<typeof setInterval> {
  const timer = setInterval(() => {
    void scheduler.tick().catch(() => logger.log({
      correlationId: `scheduler-${randomUUID()}`, eventType: "scheduler_tick_failed", level: "error",
      message: "예약 작업 확인 중 오류가 발생했습니다.", metadata: { reason: "internal" },
    }));
  }, pollMs);
  timer.unref();
  return timer;
}
