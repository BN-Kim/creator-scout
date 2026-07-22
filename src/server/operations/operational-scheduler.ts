import type { OperationRepository } from "@/server/operations/operation-repository";
import { OperationCoordinator } from "@/server/operations/operation-coordinator";

export class OperationalScheduler {
  private ticking = false;

  constructor(
    private readonly repository: OperationRepository,
    private readonly coordinator: OperationCoordinator,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async tick(): Promise<void> {
    if (this.ticking) return;
    this.ticking = true;
    try {
      if (this.repository.getControlState().paused) return;
      const recovered = new Set(await this.coordinator.recoverInterruptedExecutions());
      for (const job of this.repository.listDueSchedules(this.now().toISOString())) {
        if (recovered.has(job.id) || this.repository.getControlState().paused) continue;
        await this.coordinator.executeScheduled(job);
      }
    } finally {
      this.ticking = false;
    }
  }
}
