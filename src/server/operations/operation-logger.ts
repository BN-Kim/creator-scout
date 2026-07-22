import { randomUUID } from "node:crypto";
import type { OperationRepository } from "@/server/operations/operation-repository";
import type { OperationEventLevel, OperationalEvent } from "@/server/operations/operation-types";

const allowedMetadataKeys = new Set([
  "attempt", "jobId", "trigger", "status", "stopReason", "priorHistorySkipped", "failedCandidates",
  "retryDelayMs", "lockKey", "reason", "targetRecommendedCount", "recommendationsFilled",
]);

export type OperationalLogMetadata = Record<string, string | number | boolean | null>;

export class OperationLogger {
  constructor(
    private readonly repository: OperationRepository,
    private readonly now: () => Date = () => new Date(),
    private readonly sink: (line: string) => void = (line) => console.info(line),
    private readonly createId: () => string = randomUUID,
  ) {}

  log(input: {
    correlationId: string;
    executionId?: string | null;
    eventType: string;
    level: OperationEventLevel;
    message: string;
    metadata?: OperationalLogMetadata;
  }): OperationalEvent {
    const event: OperationalEvent = {
      id: `event-${this.createId()}`,
      correlationId: input.correlationId,
      executionId: input.executionId ?? null,
      eventType: input.eventType,
      level: input.level,
      message: input.message,
      metadata: sanitizeMetadata(input.metadata ?? {}),
      createdAt: this.now().toISOString(),
    };
    this.repository.addEvent(event);
    this.sink(JSON.stringify({
      type: "creator_scouting_operation", correlationId: event.correlationId, executionId: event.executionId,
      event: event.eventType, level: event.level, message: event.message, metadata: event.metadata, createdAt: event.createdAt,
    }));
    return event;
  }
}

export function sanitizeMetadata(metadata: OperationalLogMetadata): OperationalLogMetadata {
  return Object.fromEntries(Object.entries(metadata).filter(([key]) => allowedMetadataKeys.has(key)));
}
