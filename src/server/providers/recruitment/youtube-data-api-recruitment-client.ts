import type {
  YouTubeRecruitmentSnapshot,
  YouTubeRecruitmentSourceClient,
} from "@/server/providers/recruitment/live-source-types";
import type { YouTubeProviderConfig } from "@/server/providers/youtube/provider-config";
import { YouTubeProviderError } from "@/server/providers/youtube/provider-error";
import {
  YouTubeApiClient,
  type YouTubeApiClientDependencies,
} from "@/server/providers/youtube/youtube-api-client";

export class YouTubeDataApiRecruitmentClient implements YouTubeRecruitmentSourceClient {
  private readonly client: YouTubeApiClient;

  constructor(config: YouTubeProviderConfig, dependencies: YouTubeApiClientDependencies = {}) {
    this.client = new YouTubeApiClient(config, dependencies);
  }

  async collectPublicRecruitmentSurface(channelId: string, maxVideos: number): Promise<YouTubeRecruitmentSnapshot> {
    if (!channelId.trim() || !Number.isInteger(maxVideos) || maxVideos < 1 || maxVideos > 50) {
      throw providerError("invalid_input");
    }
    const rawChannel = await this.client.get("get_recruitment_channel", "channels", {
      part: "snippet,contentDetails",
      id: channelId,
    });
    const channel = firstItem(rawChannel, "get_recruitment_channel");
    const resolvedChannelId = text(channel.id);
    const snippet = record(channel.snippet);
    const contentDetails = record(channel.contentDetails);
    const relatedPlaylists = record(contentDetails?.relatedPlaylists);
    const channelTitle = text(snippet?.title);
    if (resolvedChannelId !== channelId || !channelTitle) throw providerError("response_invalid");

    const channelDescription = text(snippet?.description);
    const uploadsPlaylistId = text(relatedPlaylists?.uploads);
    const recentVideos = uploadsPlaylistId
      ? await this.collectRecentVideos(uploadsPlaylistId, maxVideos)
      : [];

    return {
      channelId,
      channelTitle,
      channelDescription,
      country: text(snippet?.country),
      language: text(snippet?.defaultLanguage),
      officialLinks: extractPublicUrls(channelDescription),
      recentVideos,
    };
  }

  private async collectRecentVideos(uploadsPlaylistId: string, maxVideos: number) {
    const rawPlaylist = await this.client.get("get_recruitment_video_ids", "playlistItems", {
      part: "contentDetails",
      playlistId: uploadsPlaylistId,
      maxResults: String(maxVideos),
    });
    const videoIds = items(rawPlaylist).flatMap((item) => {
      const videoId = text(record(item.contentDetails)?.videoId);
      return videoId ? [videoId] : [];
    });
    if (videoIds.length === 0) return [];

    const rawVideos = await this.client.get("get_recruitment_videos", "videos", {
      part: "snippet",
      id: [...new Set(videoIds)].join(","),
    });
    const byId = new Map(items(rawVideos).flatMap((item) => {
      const videoId = text(item.id);
      const snippet = record(item.snippet);
      const title = text(snippet?.title);
      return videoId && title ? [[videoId, {
        videoId,
        title,
        description: text(snippet?.description),
      }] as const] : [];
    }));
    return videoIds.flatMap((videoId) => {
      const video = byId.get(videoId);
      return video ? [video] : [];
    });
  }
}

function items(value: unknown): Array<Record<string, unknown>> {
  const response = record(value);
  return Array.isArray(response?.items)
    ? response.items.flatMap((item) => {
        const itemRecord = record(item);
        return itemRecord ? [itemRecord] : [];
      })
    : [];
}

function firstItem(value: unknown, operation: string): Record<string, unknown> {
  const item = items(value)[0];
  if (!item) throw new YouTubeProviderError("YouTube channel was not found.", {
    category: "not_found",
    operation,
    retryable: false,
  });
  return item;
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function extractPublicUrls(description: string | null): string[] {
  if (!description) return [];
  const matches = description.match(/https?:\/\/[^\s<>"')\]}]+/gi) ?? [];
  return [...new Set(matches.flatMap((candidate) => {
    try {
      const url = new URL(candidate.replace(/[.,!?;:]+$/, ""));
      return url.protocol === "http:" || url.protocol === "https:" ? [url.toString()] : [];
    } catch {
      return [];
    }
  }))];
}

function providerError(category: "invalid_input" | "response_invalid"): YouTubeProviderError {
  return new YouTubeProviderError("YouTube recruitment evidence response is invalid.", {
    category,
    operation: "recruitment_evidence",
    retryable: false,
  });
}
