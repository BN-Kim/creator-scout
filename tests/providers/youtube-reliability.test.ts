import { describe, expect, it } from "vitest";
import { createConfiguredYouTubeProvider, createYouTubeDataApiProvider } from "@/server/providers/youtube/create-provider";
import { YouTubeApiClient } from "@/server/providers/youtube/youtube-api-client";
import { YouTubeDataApiProvider } from "@/server/providers/youtube/youtube-data-api-provider";
import { YouTubeProviderError } from "@/server/providers/youtube/provider-error";
import type { YouTubeProviderLogEvent, YouTubeProviderLogger } from "@/server/providers/youtube/provider-logger";
import { FetchQueue, MOCK_CHANNEL_ID, TEST_API_KEY, jsonResponse, providerConfig, rawIdentityChannel } from "./test-helpers";

describe("YouTube provider reliability", () => {
  it("fails with a structured configuration error when the credential is missing", () => {
    expect(() => createYouTubeDataApiProvider({ NODE_ENV: "test" })).toThrowError(expect.objectContaining({
      category: "configuration", operation: "configuration", retryable: false,
    }));
  });

  it("always selects the official Data API provider and requires its key", () => {
    expect(() => createConfiguredYouTubeProvider({ NODE_ENV: "test" })).toThrowError(
      expect.objectContaining({ category: "configuration" }),
    );
    const provider = createConfiguredYouTubeProvider({
      NODE_ENV: "test",
      YOUTUBE_API_KEY: TEST_API_KEY,
    });
    expect(provider).toBeInstanceOf(YouTubeDataApiProvider);
  });

  it("times out with a structured retryable error", async () => {
    const queue = new FetchQueue(() => new Promise<Response>(() => undefined));
    const client = new YouTubeApiClient(providerConfig({ requestTimeoutMs: 5 }), { fetch: queue.fetch });
    await expect(client.get("timeout_test", "channels", { id: MOCK_CHANNEL_ID })).rejects.toMatchObject({
      category: "timeout", operation: "timeout_test", retryable: true,
    });
    expect(queue.urls).toHaveLength(1);
  });

  it("retries a temporary error only within the configured bound", async () => {
    const queue = new FetchQueue(jsonResponse({ error: {} }, 503), jsonResponse(rawIdentityChannel()));
    const delays: number[] = [];
    const provider = new YouTubeDataApiProvider(providerConfig({ maxRetries: 1, retryBaseDelayMs: 7 }), {
      fetch: queue.fetch,
      sleep: async (milliseconds) => { delays.push(milliseconds); },
    });
    const result = await provider.resolveIdentity({ kind: "channel_id", value: MOCK_CHANNEL_ID });
    expect(result.identity.channelId).toBe(MOCK_CHANNEL_ID);
    expect(queue.urls).toHaveLength(2);
    expect(delays).toEqual([7]);
  });

  it("does not retry permanent invalid-input errors", async () => {
    const queue = new FetchQueue(jsonResponse({ error: { errors: [{ reason: "badRequest" }] } }, 400));
    const provider = new YouTubeDataApiProvider(providerConfig({ maxRetries: 3 }), { fetch: queue.fetch, sleep: async () => undefined });
    await expect(provider.resolveIdentity({ kind: "channel_id", value: MOCK_CHANNEL_ID })).rejects.toMatchObject({ category: "invalid_input", retryable: false });
    expect(queue.urls).toHaveLength(1);
  });

  it("classifies quota exhaustion separately and never retries it", async () => {
    const queue = new FetchQueue(jsonResponse({ error: { errors: [{ reason: "quotaExceeded" }] } }, 403));
    const provider = new YouTubeDataApiProvider(providerConfig({ maxRetries: 3 }), { fetch: queue.fetch, sleep: async () => undefined });
    await expect(provider.resolveIdentity({ kind: "channel_id", value: MOCK_CHANNEL_ID })).rejects.toMatchObject({
      category: "quota_exceeded", retryable: false, status: 403,
    });
    expect(queue.urls).toHaveLength(1);
  });

  it("classifies rate limits as bounded retryable failures", async () => {
    const queue = new FetchQueue(jsonResponse({ error: { errors: [{ reason: "rateLimitExceeded" }] } }, 403));
    const provider = new YouTubeDataApiProvider(providerConfig({ maxRetries: 0 }), { fetch: queue.fetch });
    await expect(provider.resolveIdentity({ kind: "channel_id", value: MOCK_CHANNEL_ID })).rejects.toMatchObject({ category: "rate_limited", retryable: true });
  });

  it("uses a longer bounded backoff for rate limits and recovers without changing providers", async () => {
    const rateLimited = new Response(JSON.stringify({ error: { errors: [{ reason: "rateLimitExceeded" }] } }), {
      status: 429,
      headers: { "Content-Type": "application/json", "Retry-After": "7" },
    });
    const queue = new FetchQueue(rateLimited, jsonResponse(rawIdentityChannel()));
    const delays: number[] = [];
    const provider = new YouTubeDataApiProvider(providerConfig({
      maxRetries: 0,
      maxRateLimitRetries: 1,
      rateLimitRetryBaseDelayMs: 5_000,
    }), {
      fetch: queue.fetch,
      sleep: async (milliseconds) => { delays.push(milliseconds); },
    });

    const result = await provider.resolveIdentity({ kind: "channel_id", value: MOCK_CHANNEL_ID });

    expect(result.identity.channelId).toBe(MOCK_CHANNEL_ID);
    expect(queue.urls).toHaveLength(2);
    expect(delays).toEqual([7_000]);
  });

  it("treats the search-specific 429 as exhausted daily search quota without retrying", async () => {
    const queue = new FetchQueue(jsonResponse({ error: { errors: [{ reason: "rateLimitExceeded" }] } }, 429));
    const delays: number[] = [];
    const provider = new YouTubeDataApiProvider(providerConfig({
      maxRateLimitRetries: 5,
      rateLimitRetryBaseDelayMs: 5_000,
    }), {
      fetch: queue.fetch,
      sleep: async (milliseconds) => { delays.push(milliseconds); },
    });

    await expect(provider.discoverCandidates({ query: "허구 검색", maxResults: 3 })).rejects.toMatchObject({
      category: "quota_exceeded",
      operation: "discover_candidates",
      retryable: false,
      status: 429,
    });
    expect(queue.urls).toHaveLength(1);
    expect(delays).toEqual([]);
  });

  it("never exposes credentials in returned errors or request logs", async () => {
    const events: YouTubeProviderLogEvent[] = [];
    const logger: YouTubeProviderLogger = { log: (event) => { events.push(event); } };
    const queue = new FetchQueue(jsonResponse({ error: { message: `rejected ${TEST_API_KEY}`, errors: [{ reason: "keyInvalid" }] } }, 403));
    const provider = new YouTubeDataApiProvider(providerConfig(), { fetch: queue.fetch, logger });
    let caught: YouTubeProviderError | null = null;
    try {
      await provider.resolveIdentity({ kind: "channel_id", value: MOCK_CHANNEL_ID });
    } catch (error) {
      caught = error instanceof YouTubeProviderError ? error : null;
    }
    expect(caught).not.toBeNull();
    expect(JSON.stringify(caught)).not.toContain(TEST_API_KEY);
    expect(JSON.stringify(events)).not.toContain(TEST_API_KEY);
    expect(events.every((event) => !("url" in event) && !("apiKey" in event))).toBe(true);
  });
});
