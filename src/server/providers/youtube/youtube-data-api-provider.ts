import { parseYouTubeIdentityInput, isStableYouTubeChannelId } from "@/server/providers/youtube/identity-input";
import type { YouTubeCandidateDiscoveryProvider, YouTubeEvidenceProvider, YouTubeIdentityProvider } from "@/server/providers/youtube/provider-contracts";
import type { YouTubeProviderConfig } from "@/server/providers/youtube/provider-config";
import { YouTubeProviderError } from "@/server/providers/youtube/provider-error";
import type {
  CandidateDiscoveryRequest, CandidateDiscoveryResult, ChannelEvidenceResult, IdentityResolutionResult,
  CandidateDiscoveryStrategy, NormalizedVideoEvidence, RecentVideoEvidenceResult, RecentVideoRequest, ResolvedYouTubeIdentity,
  YouTubeIdentityInput,
} from "@/server/providers/youtube/provider-types";
import { YouTubeApiClient, type YouTubeApiClientDependencies } from "@/server/providers/youtube/youtube-api-client";

export class YouTubeDataApiProvider implements YouTubeCandidateDiscoveryProvider, YouTubeIdentityProvider, YouTubeEvidenceProvider {
  private readonly client: YouTubeApiClient;

  constructor(config: YouTubeProviderConfig, dependencies: YouTubeApiClientDependencies = {}) {
    this.client = new YouTubeApiClient(config, dependencies);
  }

  async discoverCandidates(request: CandidateDiscoveryRequest): Promise<CandidateDiscoveryResult> {
    const query = request.query.trim();
    if (!query || !Number.isInteger(request.maxResults) || request.maxResults < 1 || request.maxResults > 50) {
      throw providerError("Candidate discovery input is invalid.", "discover_candidates", "invalid_input");
    }
    const token = decodeDiscoveryPageToken(request.pageToken);
    const strategy = token?.strategy ?? request.strategy ?? "channel";
    if (strategy === "recent_video" && (!request.publishedAfter || Number.isNaN(Date.parse(request.publishedAfter)))) {
      throw providerError("Recent-video discovery needs a valid publishedAfter value.", "discover_candidates", "invalid_input");
    }
    const parameters: Record<string, string> = strategy === "recent_video"
      ? {
          part: "snippet", type: "video", q: query, maxResults: String(request.maxResults),
          publishedAfter: new Date(request.publishedAfter!).toISOString(), order: "date",
        }
      : { part: "snippet", type: "channel", q: query, maxResults: String(request.maxResults) };
    if (token?.value ?? request.pageToken) parameters.pageToken = token?.value ?? request.pageToken!;
    const raw = await this.client.get("discover_candidates", "search", parameters);
    const response = requireRecord(raw, "discover_candidates");
    const items = optionalArray(response.items);
    const seen = new Set<string>();
    const candidates = items.flatMap((item) => {
      const record = optionalRecord(item);
      const id = optionalRecord(record?.id);
      const snippet = optionalRecord(record?.snippet);
      const channelId = strategy === "recent_video"
        ? stringValue(snippet?.channelId)
        : stringValue(id?.channelId);
      if (!channelId || !isStableYouTubeChannelId(channelId) || seen.has(channelId)) return [];
      seen.add(channelId);
      return [{
        channelId,
        discoveredTitle: strategy === "recent_video"
          ? stringValue(snippet?.channelTitle)
          : stringValue(snippet?.title),
        identityInput: { kind: "channel_id" as const, value: channelId },
        sourceQuery: query,
      }];
    });
    const rawNextPageToken = stringValue(response.nextPageToken);
    return {
      candidates,
      nextPageToken: rawNextPageToken
        ? encodeDiscoveryPageToken(strategy, rawNextPageToken)
        : null,
      raw,
    };
  }

  async resolveIdentity(input: YouTubeIdentityInput): Promise<IdentityResolutionResult> {
    const lookup = parseYouTubeIdentityInput(input);
    const raw = await this.client.get("resolve_identity", "channels", {
      part: "id,snippet",
      [lookup.filter]: lookup.value,
    });
    const channel = firstChannel(raw, "resolve_identity");
    const channelId = stringValue(channel.id);
    const snippet = optionalRecord(channel.snippet);
    const channelName = stringValue(snippet?.title);
    if (!channelId || !isStableYouTubeChannelId(channelId) || !channelName) {
      throw providerError("YouTube identity response is invalid.", "resolve_identity", "response_invalid");
    }
    return {
      identity: {
        channelId,
        channelName,
        handle: rawHandle(snippet?.customUrl),
        canonicalChannelUrl: `https://www.youtube.com/channel/${channelId}`,
        resolvedFrom: lookup.resolvedFrom,
      },
      raw,
    };
  }

  async getChannelEvidence(identity: ResolvedYouTubeIdentity): Promise<ChannelEvidenceResult> {
    const raw = await this.client.get("get_channel_evidence", "channels", {
      part: "snippet,statistics,contentDetails",
      id: identity.channelId,
    });
    const channel = firstChannel(raw, "get_channel_evidence");
    const channelId = stringValue(channel.id);
    const snippet = optionalRecord(channel.snippet);
    const statistics = optionalRecord(channel.statistics);
    const contentDetails = optionalRecord(channel.contentDetails);
    const relatedPlaylists = optionalRecord(contentDetails?.relatedPlaylists);
    const channelName = stringValue(snippet?.title);
    if (!channelId || channelId !== identity.channelId || !channelName) {
      throw providerError("YouTube channel evidence response is invalid.", "get_channel_evidence", "response_invalid");
    }
    const subscriberCountHidden = statistics?.hiddenSubscriberCount === true;
    return {
      normalized: {
        evidenceSource: "youtube_data_api_v3",
        channelId,
        channelName,
        handle: rawHandle(snippet?.customUrl) ?? identity.handle,
        canonicalChannelUrl: `https://www.youtube.com/channel/${channelId}`,
        subscriberCount: subscriberCountHidden ? null : countValue(statistics?.subscriberCount),
        subscriberCountHidden,
        publicVideoCount: countValue(statistics?.videoCount),
        channelPublishedAt: dateTimeValue(snippet?.publishedAt),
        country: stringValue(snippet?.country),
        uploadsPlaylistId: stringValue(relatedPlaylists?.uploads),
      },
      raw,
    };
  }

  async getRecentVideoEvidence(identity: ResolvedYouTubeIdentity, request: RecentVideoRequest): Promise<RecentVideoEvidenceResult> {
    if (!Number.isInteger(request.maxResults) || request.maxResults < 1 || request.maxResults > 50) {
      throw providerError("Recent video request is invalid.", "get_recent_videos", "invalid_input");
    }
    if (!request.uploadsPlaylistId) {
      throw providerError("Uploads playlist evidence is unavailable.", "get_recent_videos", "response_invalid");
    }
    const rawPlaylist = await this.client.get("get_recent_video_ids", "playlistItems", {
      part: "contentDetails", playlistId: request.uploadsPlaylistId, maxResults: String(request.maxResults),
    });
    const playlistResponse = requireRecord(rawPlaylist, "get_recent_video_ids");
    const playlistItems = optionalArray(playlistResponse.items);
    const publishedById = new Map<string, string | null>();
    const videoIds: string[] = [];
    for (const item of playlistItems) {
      const contentDetails = optionalRecord(optionalRecord(item)?.contentDetails);
      const videoId = stringValue(contentDetails?.videoId);
      if (!videoId || videoIds.includes(videoId)) continue;
      videoIds.push(videoId);
      publishedById.set(videoId, dateTimeValue(contentDetails?.videoPublishedAt));
    }
    if (!videoIds.length) return createRecentVideoResult([], [], { playlist: rawPlaylist, videos: null });
    const rawVideos = await this.client.get("get_recent_video_evidence", "videos", {
      part: "snippet,statistics,contentDetails", id: videoIds.join(","),
    });
    const videoResponse = requireRecord(rawVideos, "get_recent_video_evidence");
    const normalizedById = new Map<string, NormalizedVideoEvidence>();
    for (const item of optionalArray(videoResponse.items)) {
      const video = optionalRecord(item);
      const videoId = stringValue(video?.id);
      if (!videoId || !videoIds.includes(videoId)) continue;
      const snippet = optionalRecord(video?.snippet);
      const statistics = optionalRecord(video?.statistics);
      const contentDetails = optionalRecord(video?.contentDetails);
      const durationSeconds = parseIsoDurationSeconds(stringValue(contentDetails?.duration));
      const publishedAt = dateTimeValue(snippet?.publishedAt) ?? publishedById.get(videoId) ?? null;
      if (!publishedAt) continue;
      normalizedById.set(videoId, {
        videoId,
        publishedAt,
        viewCount: countValue(statistics?.viewCount),
        durationSeconds,
        durationClass: durationSeconds === null ? "unknown" : durationSeconds <= 180 ? "shorts_length" : "long_form_length",
      });
    }
    const videos = videoIds.flatMap((videoId) => {
      const video = normalizedById.get(videoId);
      return video ? [video] : [];
    });
    const unavailable = videoIds.filter((videoId) => !normalizedById.has(videoId));
    return createRecentVideoResult(videos, unavailable, { playlist: rawPlaylist, videos: rawVideos });
  }
}

const discoveryTokenSeparator = ":";

function encodeDiscoveryPageToken(strategy: CandidateDiscoveryStrategy, value: string): string {
  return `${strategy}${discoveryTokenSeparator}${value}`;
}

function decodeDiscoveryPageToken(value: string | undefined): { strategy: CandidateDiscoveryStrategy; value: string } | null {
  if (!value) return null;
  const separatorIndex = value.indexOf(discoveryTokenSeparator);
  if (separatorIndex < 0) return null;
  const strategy = value.slice(0, separatorIndex);
  const token = value.slice(separatorIndex + 1);
  if ((strategy !== "channel" && strategy !== "recent_video") || !token) return null;
  return { strategy, value: token };
}

function createRecentVideoResult(videos: NormalizedVideoEvidence[], unavailableVideoIds: string[], raw: unknown): RecentVideoEvidenceResult {
  return {
    normalized: {
      videos,
      shortsLengthSamples: videos.filter((video) => video.durationClass === "shorts_length"),
      longFormLengthSamples: videos.filter((video) => video.durationClass === "long_form_length"),
      unknownDurationSamples: videos.filter((video) => video.durationClass === "unknown"),
      unavailableVideoIds,
    },
    raw,
  };
}

function firstChannel(raw: unknown, operation: string): Record<string, unknown> {
  const response = requireRecord(raw, operation);
  const items = optionalArray(response.items);
  if (!items.length) throw providerError("YouTube channel was not found.", operation, "not_found");
  const channel = optionalRecord(items[0]);
  if (!channel) throw providerError("YouTube channel response is invalid.", operation, "response_invalid");
  return channel;
}

function requireRecord(value: unknown, operation: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) throw providerError("YouTube provider response is invalid.", operation, "response_invalid");
  return record;
}

function optionalRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : null;
}

function optionalArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function rawHandle(value: unknown): string | null {
  const handle = stringValue(value);
  return handle?.startsWith("@") ? handle : null;
}

function dateTimeValue(value: unknown): string | null {
  const candidate = stringValue(value);
  return candidate && !Number.isNaN(Date.parse(candidate)) ? candidate : null;
}

function countValue(value: unknown): number | null {
  if (typeof value !== "string" || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export function parseIsoDurationSeconds(value: string | null): number | null {
  if (!value) return null;
  const match = /^P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(value);
  if (!match) return null;
  const [, days = "0", hours = "0", minutes = "0", seconds = "0"] = match;
  return Number(days) * 86_400 + Number(hours) * 3_600 + Number(minutes) * 60 + Number(seconds);
}

function providerError(message: string, operation: string, category: "invalid_input" | "not_found" | "response_invalid"): YouTubeProviderError {
  return new YouTubeProviderError(message, { category, operation, retryable: false });
}
