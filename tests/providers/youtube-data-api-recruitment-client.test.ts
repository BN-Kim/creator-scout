import { describe, expect, it } from "vitest";
import { YouTubeDataApiRecruitmentClient } from "@/server/providers/recruitment/youtube-data-api-recruitment-client";
import { FetchQueue, MOCK_CHANNEL_ID, jsonResponse, providerConfig } from "./test-helpers";

describe("official YouTube recruitment surface client", () => {
  it("collects public channel and recent video descriptions without YouTube.js", async () => {
    const channel = { items: [{
      id: MOCK_CHANNEL_ID,
      snippet: {
        title: "허구 공식 API 채널",
        description: "공개 문의 contact@gmail.com 공식 사이트 https://creator.example.invalid/contact",
        country: "KR",
        defaultLanguage: "ko",
      },
      contentDetails: { relatedPlaylists: { uploads: "UUfictionaluploads" } },
    }] };
    const playlist = { items: [
      { contentDetails: { videoId: "fictional-video-1" }, snippet: { title: "한국어 허구 영상", description: "공개 영상 설명" } },
      { contentDetails: { videoId: "fictional-video-2" }, snippet: { title: "두 번째 허구 영상", description: null } },
    ] };
    const queue = new FetchQueue(jsonResponse(channel), jsonResponse(playlist));
    const client = new YouTubeDataApiRecruitmentClient(providerConfig(), { fetch: queue.fetch });

    const result = await client.collectPublicRecruitmentSurface(MOCK_CHANNEL_ID, 20);

    expect(result).toEqual({
      channelId: MOCK_CHANNEL_ID,
      channelTitle: "허구 공식 API 채널",
      channelDescription: "공개 문의 contact@gmail.com 공식 사이트 https://creator.example.invalid/contact",
      country: "KR",
      language: "ko",
      officialLinks: ["https://creator.example.invalid/contact"],
      recentVideos: [
        { videoId: "fictional-video-1", title: "한국어 허구 영상", description: "공개 영상 설명" },
        { videoId: "fictional-video-2", title: "두 번째 허구 영상", description: null },
      ],
      descriptionCollection: { channel: "available", recentVideos: "available" },
      stopReasons: [],
    });
    expect(queue.urls).toHaveLength(2);
    expect(queue.urls[1].searchParams.get("part")).toBe("snippet,contentDetails");
    expect(queue.urls.every((url) => url.searchParams.get("key") !== null)).toBe(true);
  });

  it("preserves an already collected channel description when recent-video collection fails", async () => {
    const queue = new FetchQueue(
      jsonResponse({ items: [{
        id: MOCK_CHANNEL_ID,
        snippet: { title: "허구 부분 성공 채널", description: "공개 문의 partial@gmail.com" },
        contentDetails: { relatedPlaylists: { uploads: "UUfictionalpartial" } },
      }] }),
      jsonResponse({ error: { errors: [{ reason: "backendError" }] } }, 503),
    );
    const client = new YouTubeDataApiRecruitmentClient(providerConfig(), { fetch: queue.fetch });

    await expect(client.collectPublicRecruitmentSurface(MOCK_CHANNEL_ID, 20)).resolves.toMatchObject({
      channelDescription: "공개 문의 partial@gmail.com",
      recentVideos: [],
      descriptionCollection: { channel: "available", recentVideos: "unavailable" },
      stopReasons: ["temporary_failure"],
    });
  });

  it("rejects malformed channel responses without exposing a provider body", async () => {
    const queue = new FetchQueue(jsonResponse({ items: [{ id: MOCK_CHANNEL_ID, snippet: {} }] }));
    const client = new YouTubeDataApiRecruitmentClient(providerConfig(), {
      fetch: queue.fetch,
    });
    await expect(client.collectPublicRecruitmentSurface(MOCK_CHANNEL_ID, 20)).rejects.toMatchObject({
      category: "response_invalid",
      retryable: false,
    });
  });
});
