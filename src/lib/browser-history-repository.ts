import { findHistoryMatch } from "@/server/history/history-matcher";
import type { HistoryFilters, HistoryRepository } from "@/server/history/history-repository";
import type { CreatorIdentity, HistoryRecord } from "@/types/domain";

export const HISTORY_STORAGE_KEY = "creator-scout-history-v2";

export class BrowserHistoryRepository implements HistoryRepository {
  constructor(private readonly storage: Pick<Storage, "getItem" | "setItem">) {}
  load(): HistoryRecord[] { const value = this.storage.getItem(HISTORY_STORAGE_KEY); if (!value) return []; try { const parsed: unknown = JSON.parse(value); return Array.isArray(parsed) ? parsed as HistoryRecord[] : []; } catch (error) { console.error("히스토리를 불러오지 못했습니다.", error); return []; } }
  search(filters: HistoryFilters): HistoryRecord[] { const query = filters.query?.trim().toLocaleLowerCase("ko-KR") ?? ""; return this.load().filter((record) => (!query || record.identity.channelName.toLocaleLowerCase("ko-KR").includes(query)) && (!filters.status || filters.status === "all" || record.historyStatus === filters.status) && (!filters.category || filters.category === "all" || record.category === filters.category)); }
  findDuplicate(identity: CreatorIdentity): HistoryRecord | null { const records = this.load(); const match = findHistoryMatch(identity, records); return match?.recordId ? records.find((record) => record.id === match.recordId) ?? null : null; }
  addOrUpdate(record: HistoryRecord): HistoryRecord[] { const records = this.load(); const match = findHistoryMatch(record.identity, records); if (!match?.recordId) { const next = [...records, record]; this.replace(next); return next; } const next = records.map((item) => item.id === match.recordId ? mergeHistoryRecord(item, record) : item); this.replace(next); return next; }
  replace(records: HistoryRecord[]): void { this.storage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(records)); }
}

export function mergeHistoryRecord(existing: HistoryRecord, incoming: HistoryRecord): HistoryRecord {
  return { ...existing, ...incoming, id: existing.id, createdAt: existing.createdAt, identity: {
    ...existing.identity, ...incoming.identity,
    youtubeChannelId: incoming.identity.youtubeChannelId ?? existing.identity.youtubeChannelId,
    canonicalChannelUrl: incoming.identity.canonicalChannelUrl ?? existing.identity.canonicalChannelUrl,
    youtubeHandle: incoming.identity.youtubeHandle ?? existing.identity.youtubeHandle,
    confirmedAliases: [...new Set([...existing.identity.confirmedAliases, ...incoming.identity.confirmedAliases])],
  } };
}
