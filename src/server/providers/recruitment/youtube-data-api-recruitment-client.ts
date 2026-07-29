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
    let recentVideos: YouTubeRecruitmentSnapshot["recentVideos"] = [];
    let recentVideoCollection: YouTubeRecruitmentSnapshot["descriptionCollection"]["recentVideos"] = "empty";
    const stopReasons: YouTubeRecruitmentSnapshot["stopReasons"] = [];
    if (uploadsPlaylistId) {
      try {
        recentVideos = await this.collectRecentVideos(uploadsPlaylistId, maxVideos);
        recentVideoCollection = recentVideos.length > 0 ? "available" : "empty";
      } catch (error: unknown) {
        if (!(error instanceof YouTubeProviderError)) throw error;
        recentVideoCollection = "unavailable";
        stopReasons.push(stopReasonFor(error));
      }
    }

    return {
      channelId,
      channelTitle,
      channelDescription,
      country: text(snippet?.country),
      language: text(snippet?.defaultLanguage),
      officialLinks: extractPublicUrls(channelDescription),
      recentVideos,
      descriptionCollection: {
        channel: channelDescription ? "available" : "empty",
        recentVideos: recentVideoCollection,
      },
      stopReasons,
    };
  }

  private async collectRecentVideos(uploadsPlaylistId: string, maxVideos: number) {
    const rawPlaylist = await this.client.get("get_recruitment_video_ids", "playlistItems", {
      part: "snippet,contentDetails",
      playlistId: uploadsPlaylistId,
      maxResults: String(maxVideos),
    });
    return items(rawPlaylist).flatMap((item) => {
      const videoId = text(record(item.contentDetails)?.videoId);
      const snippet = record(item.snippet);
      const title = text(snippet?.title);
      return videoId && title ? [{
        videoId,
        title,
        description: text(snippet?.description),
      }] : [];
    });
  }
}

function stopReasonFor(error: YouTubeProviderError): YouTubeRecruitmentSnapshot["stopReasons"][number] {
  if (error.category === "timeout") return "timeout";
  if (["unauthorized", "access_restricted"].includes(error.category)) return "access_restricted";
  if (["quota_exceeded", "rate_limited"].includes(error.category)) return "rate_limited";
  if (["response_invalid", "provider_incompatible"].includes(error.category)) return "malformed_content";
  return "temporary_failure";
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
