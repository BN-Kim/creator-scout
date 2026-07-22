import type {
  AutomaticRunConfiguration,
  OperationControlState,
  OperationalEvent,
  OperationLease,
  OperationMonitoringSnapshot,
  ScheduledScoutingJob,
  ScoutingRunExecution,
} from "@/server/operations/operation-types";

export interface OperationRepository {
  getControlState(): OperationControlState;
  setPaused(paused: boolean, reason: string | null, now: string): OperationControlState;
  createSchedule(input: { id: string; name: string; intervalMinutes: number; request: AutomaticRunConfiguration; nextRunAt: string; maxRetries: number; now: string }): ScheduledScoutingJob;
  listSchedules(): ScheduledScoutingJob[];
  listDueSchedules(now: string): ScheduledScoutingJob[];
  updateScheduleAfterRun(id: string, input: { succeeded: boolean; lastRunAt: string; nextRunAt: string; now: string }): void;
  setScheduleEnabled(id: string, enabled: boolean, now: string): void;
  tryAcquireLease(lease: OperationLease): boolean;
  renewLease(lockKey: string, ownerId: string, expiresAt: string): boolean;
  releaseLease(lockKey: string, ownerId: string): void;
  deleteExpiredLeases(now: string): number;
  createExecution(execution: ScoutingRunExecution): void;
  updateExecution(execution: ScoutingRunExecution): void;
  getExecution(id: string): ScoutingRunExecution | null;
  listExecutions(limit?: number): ScoutingRunExecution[];
  markInterruptedExecutions(now: string): ScoutingRunExecution[];
  addEvent(event: OperationalEvent): void;
  listEvents(limit?: number): OperationalEvent[];
  getMonitoringSnapshot(now: string): OperationMonitoringSnapshot;
  resetForTests(now: string): void;
}
