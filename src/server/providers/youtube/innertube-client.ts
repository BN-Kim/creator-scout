import type { ParsedYouTubeIdentityLookup } from "@/server/providers/youtube/identity-input";

export type InnerTubeBridgeErrorCategory =
  | "invalid_input"
  | "not_found"
  | "response_invalid"
  | "access_restricted"
  | "provider_incompatible"
  | "temporary";

export class InnerTubeBridgeError extends Error {
  constructor(readonly category: InnerTubeBridgeErrorCategory) {
    super("InnerTube bridge operation failed.");
    this.name = "InnerTubeBridgeError";
  }
}

export interface InnerTubeChannelSummary {
  channelId: string;
  channelName: string | null;
}

export interface InnerTubeChannelSnapshot {
  channelId: string;
  channelName: string;
  handle: string | null;
  subscriberText: string | null;
  publicVideoCountText: string | null;
  raw: unknown;
}

export interface InnerTubeVideoSnapshot {
  videoId: string;
  publishedAt: string | null;
  viewCountText: string | null;
  durationSeconds: number | null;
}

export interface InnerTubeDiscoverySnapshot {
  channels: InnerTubeChannelSummary[];
  nextPageToken: string | null;
  raw: unknown;
}

export interface InnerTubeRecentVideosSnapshot {
  videos: InnerTubeVideoSnapshot[];
  unavailableVideoIds: string[];
  raw: unknown;
}

export interface InnerTubeClient {
  discoverChannels(query: string, maxResults: number, pageToken?: string): Promise<InnerTubeDiscoverySnapshot>;
  resolveChannel(lookup: ParsedYouTubeIdentityLookup): Promise<InnerTubeChannelSnapshot>;
  getChannel(channelId: string): Promise<InnerTubeChannelSnapshot>;
  getRecentVideos(channelId: string, maxResults: number): Promise<InnerTubeRecentVideosSnapshot>;
}
