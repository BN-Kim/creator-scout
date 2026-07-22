import { normalizeCreatorName } from "@/server/history/history-matcher";
import { classifyYoutubeUrl, normalizeUrl } from "@/server/history/url-classifier";
import type { CreatorIdentity } from "@/types/domain";

export type IdentityKeyType = "channel_id" | "canonical_url" | "handle" | "name";
export interface IdentityKey { type: IdentityKeyType; value: string; priority: number; }

export function createIdentityKeys(identity: CreatorIdentity): IdentityKey[] {
  const keys: IdentityKey[] = [];
  if (identity.youtubeChannelId) keys.push({ type: "channel_id", value: identity.youtubeChannelId, priority: 1 });
  if (identity.canonicalChannelUrl && classifyYoutubeUrl(identity.canonicalChannelUrl) !== "search") {
    keys.push({ type: "canonical_url", value: normalizeUrl(identity.canonicalChannelUrl), priority: 2 });
  }
  if (identity.youtubeHandle) keys.push({ type: "handle", value: identity.youtubeHandle.toLowerCase(), priority: 3 });
  for (const name of [identity.channelName, identity.normalizedChannelName, ...identity.confirmedAliases]) {
    const value = normalizeCreatorName(name);
    if (value) keys.push({ type: "name", value, priority: 4 });
  }
  return [...new Map(keys.map((key) => [`${key.type}:${key.value}`, key])).values()];
}
