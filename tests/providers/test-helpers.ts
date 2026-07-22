import type { ProviderFetch } from "@/server/providers/youtube/youtube-api-client";
import type { YouTubeProviderConfig } from "@/server/providers/youtube/provider-config";

export const MOCK_CHANNEL_ID = `UC${"a".repeat(22)}`;
export const SECOND_MOCK_CHANNEL_ID = `UC${"b".repeat(22)}`;
export const TEST_API_KEY = "fictional-secret-api-key";

export function providerConfig(overrides: Partial<YouTubeProviderConfig> = {}): YouTubeProviderConfig {
  return {
    apiKey: TEST_API_KEY,
    baseUrl: "https://www.googleapis.com/youtube/v3",
    requestTimeoutMs: 100,
    maxRetries: 0,
    retryBaseDelayMs: 0,
    ...overrides,
  };
}

export class FetchQueue {
  readonly urls: URL[] = [];
  private readonly responses: Array<Response | Error | (() => Promise<Response>)>;

  constructor(...responses: Array<Response | Error | (() => Promise<Response>)>) {
    this.responses = responses;
  }

  readonly fetch: ProviderFetch = async (input) => {
    this.urls.push(new URL(typeof input === "string" || input instanceof URL ? input : input.url));
    const next = this.responses.shift();
    if (!next) throw new Error("Unexpected mock request");
    if (next instanceof Error) throw next;
    if (typeof next === "function") return next();
    return next;
  };
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

export function rawIdentityChannel(channelId = MOCK_CHANNEL_ID): unknown {
  return {
    items: [{ id: channelId, snippet: { title: "허구 목 채널", customUrl: "@fictionalmock" } }],
  };
}
