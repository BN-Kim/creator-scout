import { classifyYoutubeUrl, normalizeUrl } from "@/server/history/url-classifier";
import type { CreatorIdentity, HistoryRecord, IdentityMatch } from "@/types/domain";

export function normalizeCreatorName(value: string): string { return value.normalize("NFKC").toLocaleLowerCase("ko-KR").replace(/[\s._-]+/g, ""); }

export function identitiesMatch(identity: CreatorIdentity, candidate: CreatorIdentity): IdentityMatch {
  if (identity.youtubeChannelId && candidate.youtubeChannelId && identity.youtubeChannelId === candidate.youtubeChannelId) return { matched: true, matchedBy: "channel_id" };
  if (identity.canonicalChannelUrl && candidate.canonicalChannelUrl && classifyYoutubeUrl(identity.canonicalChannelUrl) !== "search" && normalizeUrl(identity.canonicalChannelUrl) === normalizeUrl(candidate.canonicalChannelUrl)) return { matched: true, matchedBy: "canonical_url" };
  if (identity.youtubeHandle && candidate.youtubeHandle && identity.youtubeHandle.toLowerCase() === candidate.youtubeHandle.toLowerCase()) return { matched: true, matchedBy: "handle" };
  const leftAliases = new Set(identity.confirmedAliases.map(normalizeCreatorName));
  const rightAliases = new Set(candidate.confirmedAliases.map(normalizeCreatorName));
  if (leftAliases.has(normalizeCreatorName(candidate.channelName)) || rightAliases.has(normalizeCreatorName(identity.channelName)) || [...rightAliases].some((alias) => leftAliases.has(alias))) return { matched: true, matchedBy: "alias" };
  if (identity.normalizedChannelName === candidate.normalizedChannelName) return { matched: true, matchedBy: "normalized_name" };
  return { matched: false };
}

export function findHistoryMatch(identity: CreatorIdentity, history: HistoryRecord[]): IdentityMatch | null {
  for (const record of history) { const match = identitiesMatch(identity, record.identity); if (match.matched) return { ...match, recordId: record.id }; }
  return null;
}

export function findSameRunMatch(identity: CreatorIdentity, seen: CreatorIdentity[]): IdentityMatch | null {
  for (const candidate of seen) { const match = identitiesMatch(identity, candidate); if (match.matched) return match; }
  return null;
}
