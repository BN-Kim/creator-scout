import type { HistoryExportRecord, HistoryRecord } from "@/types/domain";

export function createHistoryExport(records: HistoryRecord[]): HistoryExportRecord[] {
  return records.map((record) => ({ channel_name: record.identity.channelName, url: record.identity.canonicalChannelUrl ?? "", status: record.historyStatus }));
}
