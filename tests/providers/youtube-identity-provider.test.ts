import { describe, expect, it } from "vitest";
import { YouTubeProviderError } from "@/server/providers/youtube/provider-error";
import { YouTubeDataApiProvider } from "@/server/providers/youtube/youtube-data-api-provider";
import { FetchQueue, MOCK_CHANNEL_ID, SECOND_MOCK_CHANNEL_ID, jsonResponse, providerConfig, rawIdentityChannel } from "./test-helpers";

describe("YouTube identity and discovery provider", () => {
  it("resolves a channel ID to a stable channel identity", async () => {
    const queue = new FetchQueue(jsonResponse(rawIdentityChannel()));
    const provider = new YouTubeDataApiProvider(providerConfig(), { fetch: queue.fetch });
    const result = await provider.resolveIdentity({ kind: "channel_id", value: MOCK_CHANNEL_ID });
    expect(result.identity).toEqual({
      channelId: MOCK_CHANNEL_ID,
      channelName: "허구 목 채널",
      handle: "@fictionalmock",
      canonicalChannelUrl: `https://www.youtube.com/channel/${MOCK_CHANNEL_ID}`,
      resolvedFrom: "channel_id",
    });
    expect(queue.urls[0].searchParams.get("id")).toBe(MOCK_CHANNEL_ID);
    expect(result.raw).toEqual(rawIdentityChannel());
  });

  it("resolves handles and supported profile URLs through stable lookup filters", async () => {
    const queue = new FetchQueue(
      jsonResponse(rawIdentityChannel()),
      jsonResponse(rawIdentityChannel()),
      jsonResponse(rawIdentityChannel()),
      jsonResponse(rawIdentityChannel()),
    );
    const provider = new YouTubeDataApiProvider(providerConfig(), { fetch: queue.fetch });
    expect((await provider.resolveIdentity({ kind: "handle", value: "@fictionalmock" })).identity.channelId).toBe(MOCK_CHANNEL_ID);
    expect((await provider.resolveIdentity({ kind: "url", value: "https://www.youtube.com/@fictionalmock" })).identity.resolvedFrom).toBe("handle_url");
    expect((await provider.resolveIdentity({ kind: "url", value: "https://youtube.com/user/fictionaluser" })).identity.resolvedFrom).toBe("username_url");
    expect((await provider.resolveIdentity({ kind: "url", value: `https://www.youtube.com/channel/${MOCK_CHANNEL_ID}` })).identity.resolvedFrom).toBe("channel_url");
    expect(queue.urls.map((url) => [url.searchParams.get("forHandle"), url.searchParams.get("forUsername")])).toEqual([
      ["@fictionalmock", null], ["@fictionalmock", null], [null, "fictionaluser"], [null, null],
    ]);
  });

  it.each([
    { kind: "channel_id" as const, value: "not-a-channel" },
    { kind: "handle" as const, value: "@x" },
    { kind: "url" as const, value: "https://www.youtube.com/watch?v=fictional" },
    { kind: "url" as const, value: "https://www.youtube.com/results?search_query=fictional" },
    { kind: "url" as const, value: "https://example.invalid/channel/fictional" },
  ])("rejects invalid or non-profile identity input without a request", async (input) => {
    const queue = new FetchQueue();
    const provider = new YouTubeDataApiProvider(providerConfig(), { fetch: queue.fetch });
    await expect(provider.resolveIdentity(input)).rejects.toMatchObject({ category: "invalid_input", retryable: false });
    expect(queue.urls).toHaveLength(0);
  });

  it("classifies an empty channel response as not found", async () => {
    const provider = new YouTubeDataApiProvider(providerConfig(), { fetch: new FetchQueue(jsonResponse({ items: [] })).fetch });
    await expect(provider.resolveIdentity({ kind: "channel_id", value: MOCK_CHANNEL_ID })).rejects.toMatchObject({
      category: "not_found", operation: "resolve_identity", retryable: false,
    } satisfies Partial<YouTubeProviderError>);
  });

  it("returns paginated fictional discovery candidates without treating titles as identity", async () => {
    const first = { nextPageToken: "next-mock-page", items: [{ id: { channelId: MOCK_CHANNEL_ID }, snippet: { title: "허구 발견 1" } }] };
    const second = { items: [{ id: { channelId: SECOND_MOCK_CHANNEL_ID }, snippet: { title: "허구 발견 2" } }] };
    const queue = new FetchQueue(jsonResponse(first), jsonResponse(second));
    const provider = new YouTubeDataApiProvider(providerConfig(), { fetch: queue.fetch });
    const firstPage = await provider.discoverCandidates({ query: "허구 목 검색", maxResults: 1 });
    const secondPage = await provider.discoverCandidates({ query: "허구 목 검색", maxResults: 1, pageToken: firstPage.nextPageToken ?? undefined });
    expect(firstPage.candidates[0]).toMatchObject({ channelId: MOCK_CHANNEL_ID, identityInput: { kind: "channel_id", value: MOCK_CHANNEL_ID } });
    expect(secondPage.candidates[0].channelId).toBe(SECOND_MOCK_CHANNEL_ID);
    expect(queue.urls[1].searchParams.get("pageToken")).toBe("next-mock-page");
  });
});
