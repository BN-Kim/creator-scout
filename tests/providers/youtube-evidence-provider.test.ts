import { describe, expect, it } from "vitest";
import { YouTubeDataApiProvider, parseIsoDurationSeconds } from "@/server/providers/youtube/youtube-data-api-provider";
import type { ResolvedYouTubeIdentity } from "@/server/providers/youtube/provider-types";
import { createVerificationEvidence } from "@/server/providers/youtube/verification-evidence";
import { FetchQueue, MOCK_CHANNEL_ID, jsonResponse, providerConfig } from "./test-helpers";

const identity: ResolvedYouTubeIdentity = {
  channelId: MOCK_CHANNEL_ID,
  channelName: "허구 목 채널",
  handle: "@fictionalmock",
  canonicalChannelUrl: `https://www.youtube.com/channel/${MOCK_CHANNEL_ID}`,
  resolvedFrom: "channel_id",
};

describe("YouTube evidence provider", () => {
  it("normalizes channel evidence while preserving the raw response separately", async () => {
    const raw = { items: [{
      id: MOCK_CHANNEL_ID,
      snippet: { title: "허구 목 채널", customUrl: "@fictionalmock", publishedAt: "2025-01-01T00:00:00Z", country: "KR" },
      statistics: { subscriberCount: "12345", hiddenSubscriberCount: false, videoCount: "12" },
      contentDetails: { relatedPlaylists: { uploads: "UUfictionaluploads" } },
    }] };
    const provider = new YouTubeDataApiProvider(providerConfig(), { fetch: new FetchQueue(jsonResponse(raw)).fetch });
    const result = await provider.getChannelEvidence(identity);
    expect(result.normalized).toEqual({
      evidenceSource: "youtube_data_api_v3",
      channelId: MOCK_CHANNEL_ID,
      channelName: "허구 목 채널",
      handle: "@fictionalmock",
      canonicalChannelUrl: `https://www.youtube.com/channel/${MOCK_CHANNEL_ID}`,
      subscriberCount: 12345,
      subscriberCountHidden: false,
      publicVideoCount: 12,
      channelPublishedAt: "2025-01-01T00:00:00Z",
      country: "KR",
      uploadsPlaylistId: "UUfictionaluploads",
    });
    expect(result.raw).toEqual(raw);
    expect(result.raw).not.toBe(result.normalized);
  });

  it("keeps hidden or missing subscriber data explicitly missing", async () => {
    const raw = { items: [{ id: MOCK_CHANNEL_ID, snippet: { title: "허구 목 채널" }, statistics: { hiddenSubscriberCount: true }, contentDetails: {} }] };
    const provider = new YouTubeDataApiProvider(providerConfig(), { fetch: new FetchQueue(jsonResponse(raw)).fetch });
    const result = await provider.getChannelEvidence(identity);
    expect(result.normalized.subscriberCount).toBeNull();
    expect(result.normalized.subscriberCountHidden).toBe(true);
    expect(result.normalized.uploadsPlaylistId).toBeNull();
  });

  it("normalizes recent videos, separates duration samples, and reports missing videos", async () => {
    const playlist = { items: [
      { contentDetails: { videoId: "fictional-short", videoPublishedAt: "2026-07-20T00:00:00Z" } },
      { contentDetails: { videoId: "fictional-long", videoPublishedAt: "2026-07-19T00:00:00Z" } },
      { contentDetails: { videoId: "fictional-deleted", videoPublishedAt: "2026-07-18T00:00:00Z" } },
    ] };
    const videos = { items: [
      { id: "fictional-short", snippet: { publishedAt: "2026-07-20T00:00:00Z" }, statistics: { viewCount: "1200" }, contentDetails: { duration: "PT2M59S" } },
      { id: "fictional-long", snippet: { publishedAt: "2026-07-19T00:00:00Z" }, statistics: { viewCount: "3400" }, contentDetails: { duration: "PT8M" } },
    ] };
    const provider = new YouTubeDataApiProvider(providerConfig(), { fetch: new FetchQueue(jsonResponse(playlist), jsonResponse(videos)).fetch });
    const result = await provider.getRecentVideoEvidence(identity, { uploadsPlaylistId: "UUfictionaluploads", maxResults: 10 });
    expect(result.normalized.videos).toHaveLength(2);
    expect(result.normalized.shortsLengthSamples.map((video) => video.videoId)).toEqual(["fictional-short"]);
    expect(result.normalized.longFormLengthSamples.map((video) => video.videoId)).toEqual(["fictional-long"]);
    expect(result.normalized.unavailableVideoIds).toEqual(["fictional-deleted"]);
    expect(result.raw).toEqual({ playlist, videos });
  });

  it("keeps unavailable duration and views missing instead of inventing evidence", async () => {
    const playlist = { items: [{ contentDetails: { videoId: "fictional-missing-fields" } }] };
    const videos = { items: [{ id: "fictional-missing-fields", snippet: {} }] };
    const provider = new YouTubeDataApiProvider(providerConfig(), { fetch: new FetchQueue(jsonResponse(playlist), jsonResponse(videos)).fetch });
    const result = await provider.getRecentVideoEvidence(identity, { uploadsPlaylistId: "UUfictionaluploads", maxResults: 5 });
    expect(result.normalized.videos[0]).toMatchObject({ publishedAt: null, viewCount: null, durationSeconds: null, durationClass: "unknown" });
    expect(result.normalized.unknownDurationSamples).toHaveLength(1);
  });

  it("maps only available normalized data into the existing evidence domain", () => {
    const channel = {
      evidenceSource: "fictional_mock" as const,
      channelId: MOCK_CHANNEL_ID, channelName: "허구 목 채널", handle: "@fictionalmock",
      canonicalChannelUrl: identity.canonicalChannelUrl, subscriberCount: null, subscriberCountHidden: true,
      publicVideoCount: 2, channelPublishedAt: null, country: null, uploadsPlaylistId: "UUfictionaluploads",
    };
    const short = { videoId: "fictional-short", publishedAt: "2026-07-20T00:00:00Z", viewCount: 1000, durationSeconds: 120, durationClass: "shorts_length" as const };
    const long = { videoId: "fictional-long", publishedAt: "2026-07-19T00:00:00Z", viewCount: 3000, durationSeconds: 600, durationClass: "long_form_length" as const };
    const evidence = createVerificationEvidence(channel, {
      videos: [short, long], shortsLengthSamples: [short], longFormLengthSamples: [long], unknownDurationSamples: [], unavailableVideoIds: [],
    }, new Date("2026-07-22T00:00:00Z"));
    expect(evidence).toMatchObject({ subscriberCount: null, recentAverageViews: 2000, contentType: "mixed", visibleEmail: null, emailVerificationState: "not_checked" });
    expect(evidence.categoryFit).toBeNull();
  });

  it("parses supported ISO durations deterministically", () => {
    expect(parseIsoDurationSeconds("PT2M59S")).toBe(179);
    expect(parseIsoDurationSeconds("PT1H2M3S")).toBe(3723);
    expect(parseIsoDurationSeconds("invalid")).toBeNull();
  });
});
