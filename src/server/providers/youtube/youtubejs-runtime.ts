import "server-only";
import { randomUUID } from "node:crypto";
import pLimit from "p-limit";
import { Innertube } from "youtubei.js";
import type {
  YouTubeRecruitmentSnapshot,
  YouTubeRecruitmentSourceClient,
  YouTubeRecruitmentVideo,
} from "@/server/providers/recruitment/live-source-types";
import type { ParsedYouTubeIdentityLookup } from "@/server/providers/youtube/identity-input";
import {
  InnerTubeBridgeError,
  type InnerTubeChannelSnapshot,
  type InnerTubeChannelSummary,
  type InnerTubeClient,
  type InnerTubeDiscoverySnapshot,
  type InnerTubeRecentVideosSnapshot,
} from "@/server/providers/youtube/innertube-client";
import { parseYouTubeJsVideoCollection } from "@/server/providers/youtube/youtubejs-video-normalization";

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

export async function createYouTubeJsRecruitmentSourceClient(): Promise<YouTubeRecruitmentSourceClient> {
  try {
    const innertube = await Innertube.create({
      lang: "en",
      location: "KR",
      retrieve_player: false,
      generate_session_locally: true,
      enable_session_cache: false,
    });
    return new YouTubeJsRecruitmentSourceClient(innertube);
  } catch (error: unknown) {
    throw mapRuntimeError(error);
  }
}

class YouTubeJsRecruitmentSourceClient implements YouTubeRecruitmentSourceClient {
  async collectPublicRecruitmentSurface(channelId: string, maxVideos: number): Promise<YouTubeRecruitmentSnapshot> {
    try {
      const channel = await this.innertube.getChannel(channelId);
      const channelRecord = asRecord(channel);
      const metadata = asRecord(channelRecord?.metadata);
      const header = asRecord(channelRecord?.header);
      const resolvedChannelId = readString(metadata, "external_id") ?? readString(header, "channel_id");
      const channelTitle = readString(metadata, "title") ?? readText(header?.title);
      if (resolvedChannelId !== channelId || !channelTitle) throw new InnerTubeBridgeError("response_invalid");
      const videosPage = await channel.getVideos();
      const parsedVideos = parseYouTubeJsVideoCollection(videosPage);
      if (["unavailable", "unsupported", "malformed"].includes(parsedVideos.state)) {
        throw new InnerTubeBridgeError(parsedVideos.state === "unavailable" ? "evidence_unavailable" : "provider_incompatible");
      }
      const cards = parsedVideos.videos.flatMap((video): YouTubeRecruitmentVideo[] =>
        video.title ? [{ videoId: video.videoId, title: video.title, description: null }] : [],
      ).slice(0, maxVideos);
      const limit = pLimit(3);
      const recentVideos = await Promise.all(cards.map((card) => limit(() => this.videoDetails(card))));
      return {
        channelId,
        channelTitle,
        channelDescription: readText(metadata?.description) ?? readText(header?.description),
        country: readString(metadata, "country"),
        language: readString(metadata, "language") ?? readString(metadata, "default_language"),
        officialLinks: extractOfficialLinks(metadata, header),
        recentVideos,
      };
    } catch (error: unknown) {
      throw mapRuntimeError(error);
    }
  }

  constructor(private readonly innertube: Innertube) {}

  private async videoDetails(card: YouTubeRecruitmentVideo): Promise<YouTubeRecruitmentVideo> {
    try {
      const info = asRecord(await this.innertube.getInfo(card.videoId));
      const basicInfo = asRecord(info?.basic_info);
      return {
        videoId: card.videoId,
        title: readString(basicInfo, "title") ?? card.title,
        description: readString(basicInfo, "short_description"),
      };
    } catch {
      return card;
    }
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
      const parsed = parseYouTubeJsVideoCollection(raw);
      return {
        videos: parsed.videos.slice(0, maxResults).map(({ videoId, publishedAt, viewCountText, durationSeconds }) => ({
          videoId, publishedAt, viewCountText, durationSeconds,
        })),
        collectionState: parsed.state,
        unavailableVideoIds: [],
        raw,
      };
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

function extractOfficialLinks(
  metadata: Record<string, unknown> | null,
  header: Record<string, unknown> | null,
): string[] {
  const candidates = [...readArrayProperty(metadata, "links"), ...readArrayProperty(header, "links")];
  return [...new Set(candidates.flatMap((candidate) => {
    const record = asRecord(candidate);
    const endpoint = asRecord(record?.endpoint);
    const payload = asRecord(endpoint?.payload);
    const rawUrl = readString(record, "url") ?? readString(payload, "url") ?? readString(payload, "q");
    const external = rawUrl ? externalPublicUrl(rawUrl) : null;
    return external ? [external] : [];
  }))];
}

function externalPublicUrl(value: string): string | null {
  try {
    const initial = new URL(value, "https://www.youtube.com");
    const unwrapped = /(^|\.)youtube\.com$/i.test(initial.hostname)
      ? initial.searchParams.get("q") ?? initial.searchParams.get("url")
      : initial.toString();
    if (!unwrapped) return null;
    const url = new URL(unwrapped);
    if (!["http:", "https:"].includes(url.protocol) || /(^|\.)youtube\.com$/i.test(url.hostname) || /(^|\.)youtu\.be$/i.test(url.hostname)) return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
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
