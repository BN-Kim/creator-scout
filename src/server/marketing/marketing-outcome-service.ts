import { randomUUID } from "node:crypto";
import { openDatabase, type SqliteDatabase } from "@/server/database/database";
import { SqliteHistoryRepository } from "@/server/history/sqlite-history-repository";
import { SqliteMarketingOutcomeRepository } from "@/server/marketing/sqlite-marketing-outcome-repository";
import type { MarketingOutcomeEvent, MarketingOutcomeType } from "@/types/domain";

export interface AddMarketingOutcomeInput {
  historyRecordId: string;
  outcomeType: MarketingOutcomeType;
  occurredAt: string;
  note: string;
  contentUrl?: string | null;
  views?: number | null;
  likes?: number | null;
  comments?: number | null;
  conversions?: number | null;
  revenueKrw?: number | null;
}

export function addServerMarketingOutcome(input: AddMarketingOutcomeInput): MarketingOutcomeEvent {
  const database = getMarketingDatabase();
  const history = new SqliteHistoryRepository(database).load().find((record) => record.id === input.historyRecordId);
  if (!history) throw new MarketingOutcomeError("history_not_found");
  const createdAt = new Date().toISOString();
  const event: MarketingOutcomeEvent = {
    id: `marketing-outcome-${randomUUID()}`,
    historyRecordId: history.id,
    runId: history.scoutingRunId,
    outcomeType: input.outcomeType,
    occurredAt: input.occurredAt,
    note: input.note.trim(),
    contentUrl: input.contentUrl?.trim() || null,
    views: input.views ?? null,
    likes: input.likes ?? null,
    comments: input.comments ?? null,
    conversions: input.conversions ?? null,
    revenueKrw: input.revenueKrw ?? null,
    createdAt,
  };
  new SqliteMarketingOutcomeRepository(database).add(event);
  return event;
}

export function listServerMarketingOutcomes(filters: { historyRecordId?: string; runId?: string } = {}): MarketingOutcomeEvent[] {
  return new SqliteMarketingOutcomeRepository(getMarketingDatabase()).list(filters);
}

export class MarketingOutcomeError extends Error {
  constructor(public readonly reason: "history_not_found") {
    super("성과를 연결할 크리에이터 히스토리를 찾을 수 없습니다.");
    this.name = "MarketingOutcomeError";
  }
}

const globalMarketing = globalThis as typeof globalThis & { creatorMarketingDatabase?: SqliteDatabase };

function getMarketingDatabase(): SqliteDatabase {
  globalMarketing.creatorMarketingDatabase ??= openDatabase();
  return globalMarketing.creatorMarketingDatabase;
}
