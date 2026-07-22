import type { CreatorIdentity, HistoryRecord } from "@/types/domain";

export interface HistoryFilters { query?: string; status?: HistoryRecord["historyStatus"] | "all"; category?: string; }
export interface HistoryRepository {
  load(): HistoryRecord[];
  search(filters: HistoryFilters): HistoryRecord[];
  findDuplicate(identity: CreatorIdentity): HistoryRecord | null;
  addOrUpdate(record: HistoryRecord): HistoryRecord[];
  replace(records: HistoryRecord[]): void;
}
