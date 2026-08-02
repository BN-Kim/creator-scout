import type { HistoryRecord } from "@/types/domain";

export function mergeHistoryRecord(existing: HistoryRecord, incoming: HistoryRecord): HistoryRecord {
  const mergedIdentity = {
    ...existing.identity,
    ...incoming.identity,
    youtubeChannelId: incoming.identity.youtubeChannelId ?? existing.identity.youtubeChannelId,
    canonicalChannelUrl: incoming.identity.canonicalChannelUrl ?? existing.identity.canonicalChannelUrl,
    youtubeHandle: incoming.identity.youtubeHandle ?? existing.identity.youtubeHandle,
    confirmedAliases: [...new Set([...existing.identity.confirmedAliases, ...incoming.identity.confirmedAliases])],
  };
  if (existing.decisionSource === "manual" && incoming.decisionSource !== "manual") {
    return {
      ...existing,
      identity: mergedIdentity,
    };
  }
  return {
    ...existing,
    ...incoming,
    id: existing.id,
    createdAt: existing.createdAt,
    identity: mergedIdentity,
  };
}
