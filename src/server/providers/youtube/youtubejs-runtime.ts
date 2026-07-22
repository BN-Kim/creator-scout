import "server-only";
import { randomUUID } from "node:crypto";
import { Innertube } from "youtubei.js";
import type { ParsedYouTubeIdentityLookup } from "@/server/providers/youtube/identity-input";
import {
  InnerTubeBridgeError,
  type InnerTubeChannelSnapshot,
  type InnerTubeChannelSummary,
  type InnerTubeClient,
  type InnerTubeDiscoverySnapshot,
  type InnerTubeRecentVideosSnapshot,
  type InnerTubeVideoSnapshot,
} from "@/server/providers/youtube/innertube-client";

interface ContinuationEntry {
  query: string;
  load: () => Promise<unknown>;
}

export async function createYouTubeJsInnerTubeClient(): Promise<InnerTubeClient> {
  try {
    const innertube = await Innertube.create({
      lang: "en",
      location: "KR",
      retrieve_player: false,
      generate_session_locally: true,
      enable_session_cache: false,
    });
    return new YouTubeJsInnerTubeClient(innertube);
  } catch (error: unknown) {
    throw mapRuntimeError(error);
  }
}

class YouTubeJsInnerTubeClient implements InnerTubeClient {
  private readonly continuations = new Map<string, ContinuationEntry>();

  constructor(private readonly innertube: Innertube) {}

  async discoverChannels(query: string, maxResults: number, pageToken?: string): Promise<InnerTubeDiscoverySnapshot> {
    try {
      const raw = pageToken
        ? await this.loadContinuation(query, pageToken)
        : await this.innertube.search(query, { type: "channel" });
      const channels = readArrayProperty(raw, "channels").flatMap(channelSummary).slice(0, maxResults);
      const nextPageToken = hasBooleanProperty(raw, "has_continuation")
        ? this.storeContinuation(query, raw)
        : null;
      return { channels, nextPageToken, raw };
    } catch (error: unknown) {
      throw mapRuntimeError(error);
    }
  }

  async resolveChannel(lookup: ParsedYouTubeIdentityLookup): Promise<InnerTubeChannelSnapshot> {
    try {
      if (lookup.filter === "id") return channelSnapshot(await this.innertube.getChannel(lookup.value));
      const profileUrl = lookup.filter === "forHandle"
        ? `https://www.youtube.com/${lookup.value}`
        : `https://www.youtube.com/user/${encodeURIComponent(lookup.value)}`;
      const endpoint = await this.innertube.resolveURL(profileUrl);
      const payload = asRecord(asRecord(endpoint)?.payload);
      const channelId = readString(payload, "browseId") ?? readString(payload, "browse_id");
      if (!channelId) throw new InnerTubeBridgeError("not_found");
      return channelSnapshot(await this.innertube.getChannel(channelId));
    } catch (error: unknown) {
      throw mapRuntimeError(error);
    }
  }

  async getChannel(channelId: string): Promise<InnerTubeChannelSnapshot> {
    try {
      return channelSnapshot(await this.innertube.getChannel(channelId));
    } catch (error: unknown) {
      throw mapRuntimeError(error);
    }
  }

  async getRecentVideos(channelId: string, maxResults: number): Promise<InnerTubeRecentVideosSnapshot> {
    try {
      const channel = await this.innertube.getChannel(channelId);
      const raw = await channel.getVideos();
      const videos = readArrayProperty(raw, "videos").flatMap(videoSnapshot).slice(0, maxResults);
      return { videos, unavailableVideoIds: [], raw };
    } catch (error: unknown) {
      throw mapRuntimeError(error);
    }
  }

  private async loadContinuation(query: string, token: string): Promise<unknown> {
    const entry = this.continuations.get(token);
    this.continuations.delete(token);
    if (!entry || entry.query !== query) throw new InnerTubeBridgeError("invalid_input");
    return entry.load();
  }

  private storeContinuation(query: string, raw: unknown): string | null {
    const record = asRecord(raw);
    const continuation = record?.getContinuation;
    if (typeof continuation !== "function") return null;
    const token = randomUUID();
    this.continuations.set(token, { query, load: () => Reflect.apply(continuation, raw, []) as Promise<unknown> });
    while (this.continuations.size > 100) {
      const oldest = this.continuations.keys().next().value as string | undefined;
      if (!oldest) break;
      this.continuations.delete(oldest);
    }
    return token;
  }
}

function channelSummary(value: unknown): InnerTubeChannelSummary[] {
  const record = asRecord(value);
  const author = asRecord(record?.author);
  const channelId = readString(record, "id") ?? readString(author, "id");
  if (!channelId) return [];
  return [{ channelId, channelName: readString(author, "name") }];
}

function channelSnapshot(value: unknown): InnerTubeChannelSnapshot {
  const record = asRecord(value);
  const metadata = asRecord(record?.metadata);
  const header = asRecord(record?.header);
  const author = asRecord(header?.author);
  const channelId = readString(metadata, "external_id") ?? readString(header, "channel_id") ?? readString(author, "id");
  const channelName = readString(metadata, "title") ?? readString(author, "name") ?? readText(header?.title);
  if (!channelId || !channelName) throw new InnerTubeBridgeError("response_invalid");
  return {
    channelId,
    channelName,
    handle: readText(header?.channel_handle) ?? handleFromUrl(readString(metadata, "vanity_channel_url")),
    subscriberText: readText(header?.subscribers),
    publicVideoCountText: readText(header?.videos_count),
    raw: value,
  };
}

function videoSnapshot(value: unknown): InnerTubeVideoSnapshot[] {
  const record = asRecord(value);
  const videoId = readString(record, "video_id") ?? readString(record, "id");
  if (!videoId) return [];
  const duration = asRecord(record?.duration);
  return [{
    videoId,
    publishedAt: exactPublishedValue(record?.published),
    viewCountText: readText(record?.view_count) ?? readText(record?.views) ?? readText(record?.short_view_count),
    durationSeconds: readFiniteNumber(duration, "seconds") ?? durationFromText(readText(record?.length_text) ?? readText(record?.duration)),
  }];
}

function exactPublishedValue(value: unknown): string | null {
  const text = readText(value);
  return text && !Number.isNaN(Date.parse(text)) ? text : null;
}

function durationFromText(value: string | null): number | null {
  if (!value || !/^\d{1,3}(?::\d{1,2}){1,2}$/.test(value)) return null;
  return value.split(":").map(Number).reduce((total, part) => total * 60 + part, 0);
}

function handleFromUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const part = new URL(value).pathname.split("/").filter(Boolean)[0];
    return part?.startsWith("@") ? part : null;
  } catch {
    return null;
  }
}

function readArrayProperty(value: unknown, property: string): unknown[] {
  const candidate = asRecord(value)?.[property];
  return Array.isArray(candidate) ? candidate : [];
}

function readText(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  return readString(asRecord(value), "text");
}

function readString(record: Record<string, unknown> | null, property: string): string | null {
  const value = record?.[property];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readFiniteNumber(record: Record<string, unknown> | null, property: string): number | null {
  const value = record?.[property];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function hasBooleanProperty(value: unknown, property: string): boolean {
  return asRecord(value)?.[property] === true;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : null;
}

function mapRuntimeError(error: unknown): InnerTubeBridgeError {
  if (error instanceof InnerTubeBridgeError) return error;
  if (!(error instanceof Error)) return new InnerTubeBridgeError("provider_incompatible");
  if (error.name === "AbortError" || error.name === "TimeoutError") return new InnerTubeBridgeError("temporary");
  if (error.name === "ChannelError" || /channel.+not found|no channel/i.test(error.message)) return new InnerTubeBridgeError("not_found");
  if (/sign.?in|age.?restrict|access denied|forbidden|not available/i.test(error.message)) return new InnerTubeBridgeError("access_restricted");
  if (/fetch failed|network|socket|ECONN|ENOTFOUND|EAI_AGAIN/i.test(error.message)) return new InnerTubeBridgeError("temporary");
  return new InnerTubeBridgeError("provider_incompatible");
}
