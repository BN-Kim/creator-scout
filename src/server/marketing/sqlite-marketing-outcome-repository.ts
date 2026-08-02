import type { SqliteDatabase } from "@/server/database/database";
import type { MarketingOutcomeEvent } from "@/types/domain";

interface OutcomeRow {
  id: string;
  history_record_id: string;
  run_id: string;
  outcome_type: MarketingOutcomeEvent["outcomeType"];
  occurred_at: string;
  note: string;
  content_url: string | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  conversions: number | null;
  revenue_krw: number | null;
  created_at: string;
}

export class SqliteMarketingOutcomeRepository {
  constructor(private readonly database: SqliteDatabase) {}

  add(event: MarketingOutcomeEvent): void {
    this.database.prepare(`INSERT INTO marketing_outcome_events (
      id, history_record_id, run_id, outcome_type, occurred_at, note, content_url,
      views, likes, comments, conversions, revenue_krw, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      event.id,
      event.historyRecordId,
      event.runId,
      event.outcomeType,
      event.occurredAt,
      event.note,
      event.contentUrl,
      event.views,
      event.likes,
      event.comments,
      event.conversions,
      event.revenueKrw,
      event.createdAt,
    );
  }

  list(filters: { historyRecordId?: string; runId?: string } = {}): MarketingOutcomeEvent[] {
    return (this.database.prepare("SELECT * FROM marketing_outcome_events ORDER BY occurred_at DESC, id DESC").all() as OutcomeRow[])
      .map(toEvent)
      .filter((event) =>
        (!filters.historyRecordId || event.historyRecordId === filters.historyRecordId)
        && (!filters.runId || event.runId === filters.runId));
  }
}

function toEvent(row: OutcomeRow): MarketingOutcomeEvent {
  return {
    id: row.id,
    historyRecordId: row.history_record_id,
    runId: row.run_id,
    outcomeType: row.outcome_type,
    occurredAt: row.occurred_at,
    note: row.note,
    contentUrl: row.content_url,
    views: row.views,
    likes: row.likes,
    comments: row.comments,
    conversions: row.conversions,
    revenueKrw: row.revenue_krw,
    createdAt: row.created_at,
  };
}
