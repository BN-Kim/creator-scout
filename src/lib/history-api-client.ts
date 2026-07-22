import { HISTORY_STORAGE_KEY } from "@/lib/browser-history-repository";
import { historyRecordArraySchema } from "@/server/history/history-record-schema";
import type { HistoryFilters } from "@/server/history/history-repository";
import type { HistoryRecord } from "@/types/domain";

export const HISTORY_MIGRATION_MARKER_KEY = "creator-scout-history-server-migrated-v1";

export class HistoryApiClient {
  async load(): Promise<HistoryRecord[]> {
    return this.request("/api/history");
  }

  async search(filters: HistoryFilters): Promise<HistoryRecord[]> {
    const parameters = new URLSearchParams();
    if (filters.query) parameters.set("query", filters.query);
    if (filters.status) parameters.set("status", filters.status);
    if (filters.category) parameters.set("category", filters.category);
    return this.request(`/api/history?${parameters.toString()}`);
  }

  async addOrUpdate(records: HistoryRecord[]): Promise<HistoryRecord[]> {
    return this.request("/api/history", { method: "POST", body: JSON.stringify({ records }) });
  }

  async migrateBrowserRecords(records: HistoryRecord[]): Promise<HistoryRecord[]> {
    return this.request("/api/history/browser-migration", { method: "POST", body: JSON.stringify({ records }) });
  }

  private async request(url: string, init?: RequestInit): Promise<HistoryRecord[]> {
    const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
    if (!response.ok) throw new Error(`히스토리 서버 요청이 실패했습니다. (${response.status})`);
    const parsed = historyRecordArraySchema.safeParse(await response.json() as unknown);
    if (!parsed.success) throw new Error("히스토리 서버 응답 형식이 올바르지 않습니다.");
    return parsed.data;
  }
}

export async function migrateBrowserHistory(
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem">,
  client: Pick<HistoryApiClient, "migrateBrowserRecords">,
): Promise<void> {
  if (storage.getItem(HISTORY_MIGRATION_MARKER_KEY) === "completed") return;
  const value = storage.getItem(HISTORY_STORAGE_KEY);
  if (!value) {
    storage.setItem(HISTORY_MIGRATION_MARKER_KEY, "completed");
    return;
  }
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(value) as unknown;
  } catch {
    throw new Error("기존 브라우저 히스토리를 읽을 수 없어 서버 전환을 중단했습니다.");
  }
  const parsed = historyRecordArraySchema.safeParse(parsedJson);
  if (!parsed.success) throw new Error("기존 브라우저 히스토리 형식이 올바르지 않아 서버 전환을 중단했습니다.");
  await client.migrateBrowserRecords(parsed.data);
  storage.removeItem(HISTORY_STORAGE_KEY);
  storage.setItem(HISTORY_MIGRATION_MARKER_KEY, "completed");
}
