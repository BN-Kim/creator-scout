import type { HistoryRecord } from "@/types/domain";

export function mergeHistoryRecord(existing: HistoryRecord, incoming: HistoryRecord): HistoryRecord {
  return {
    ...existing,
    ...incoming,
    id: existing.id,
    createdAt: existing.createdAt,
    identity: {
      ...existing.identity,
      ...incoming.identity,
      youtubeChannelId: incoming.identity.youtubeChannelId ?? existing.identity.youtubeChannelId,
      canonicalChannelUrl: incoming.identity.canonicalChannelUrl ?? existing.identity.canonicalChannelUrl,
      youtubeHandle: incoming.identity.youtubeHandle ?? existing.identity.youtubeHandle,
      confirmedAliases: [...new Set([...existing.identity.confirmedAliases, ...incoming.identity.confirmedAliases])],
    },
  };
}
