import { afterEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import { defaultRecommendationSettings } from "@/config/recommendation-rules";
import { openDatabase } from "@/server/database/database";
import { SqliteHistoryRepository } from "@/server/history/sqlite-history-repository";
import { createConfiguredYouTubeProvider } from "@/server/providers/youtube/create-provider";
import {
  InnerTubeBridgeError,
  type InnerTubeChannelSnapshot,
  type InnerTubeClient,
  type InnerTubeDiscoverySnapshot,
  type InnerTubeRecentVideosSnapshot,
} from "@/server/providers/youtube/innertube-client";
import { InnerTubeYouTubeProvider, parsePublicCount } from "@/server/providers/youtube/innertube-provider";
import { createVerificationEvidence } from "@/server/providers/youtube/verification-evidence";
import type { InnerTubeProviderConfig } from "@/server/providers/youtube/provider-config";
import { YouTubeProviderError } from "@/server/providers/youtube/provider-error";
import { YouTubeDataApiProvider } from "@/server/providers/youtube/youtube-data-api-provider";
import { AutomaticScoutingPipeline } from "@/server/scouting/automatic-scouting-pipeline";

const CHANNEL_ID = `UC${"i".repeat(22)}`;
const NOW = new Date("2026-07-22T06:00:00.000Z");
const databases: Database.Database[] = [];

afterEach(() => {
  for (const database of databases.splice(0)) database.close();
});

describe("InnerTube provider selection", () => {
  it("selects innertube without requiring an API key", () => {
    const provider = createConfiguredYouTubeProvider(
      environment({ YOUTUBE_PROVIDER: "innertube" }),
      { innertube: { clientFactory: async () => new FictionalInnerTubeClient() } },
    );
    expect(provider).toBeInstanceOf(InnerTubeYouTubeProvider);
  });

  it("uses innertube as the keyless default", () => {
    const provider = createConfiguredYouTubeProvider(
      environment(),
      { innertube: { clientFactory: async () => new FictionalInnerTubeClient() } },
    );
    expect(provider).toBeInstanceOf(InnerTubeYouTubeProvider);
  });

  it("keeps the official adapter optional and requires its API key only when selected", () => {
    expect(() => createConfiguredYouTubeProvider(environment({ YOUTUBE_PROVIDER: "official" }))).toThrowError(
      expect.objectContaining({ category: "configuration" }),
    );
    const provider = createConfiguredYouTubeProvider(environment({
      YOUTUBE_PROVIDER: "official",
      YOUTUBE_API_KEY: "fictional-official-key",
    }));
    expect(provider).toBeInstanceOf(YouTubeDataApiProvider);
  });

  it("rejects unknown provider selections before any provider request", () => {
    expect(() => createConfiguredYouTubeProvider(environment({ YOUTUBE_PROVIDER: "unknown" }))).toThrowError(
      expect.objectContaining({ category: "configuration", retryable: false }),
    );
  });
});

describe("InnerTube H3 evidence adapter", () => {
  it("normalizes stable client snapshots while preserving unrelated raw responses separately", async () => {
    const rawChannel = { changed_provider_shape: { nested: ["not", "domain", "evidence"] } };
    const rawVideos = { opaque: { renderer: "fictional" } };
    const client = new FictionalInnerTubeClient({ rawChannel, rawVideos });
    const provider = providerFor(client);
    const identity = (await provider.resolveIdentity({ kind: "handle", value: "@fictionalhandle" })).identity;
    const channel = await provider.getChannelEvidence(identity);
    const recent = await provider.getRecentVideoEvidence(identity, { uploadsPlaylistId: null, maxResults: 5 });

    expect(channel.normalized).toMatchObject({
      evidenceSource: "youtubejs_innertube",
      channelId: CHANNEL_ID,
      channelName: "허구 InnerTube 채널",
      handle: "@fictionalhandle",
      subscriberCount: 12500,
      publicVideoCount: 42,
      channelPublishedAt: null,
      country: null,
      uploadsPlaylistId: null,
    });
    expect(channel.raw).toBe(rawChannel);
    expect(recent.raw).toBe(rawVideos);
    expect(recent.normalized).not.toBe(rawVideos);
    expect(recent.normalized.videos[0]).toEqual({
      videoId: "fictional-video-1",
      publishedAt: "2026-07-20T00:00:00.000Z",
      viewCount: 15000,
      durationSeconds: 600,
      durationClass: "long_form_length",
    });
    expect(recent.normalized.videos[1]).toMatchObject({
      videoId: "fictional-video-2",
      publishedAt: null,
      viewCount: null,
      durationSeconds: null,
      durationClass: "unknown",
    });
    expect(recent.normalized.unavailableVideoIds).toEqual(["fictional-deleted-video"]);
  });

  it("does not invent missing or hidden public metrics", async () => {
    const client = new FictionalInnerTubeClient({
      channel: { ...fictionalChannel(), subscriberText: null, publicVideoCountText: "hidden" },
      videos: { videos: [], collectionState: "confirmed_empty", unavailableVideoIds: ["fictional-hidden-video"], raw: { fixture: true } },
    });
    const provider = providerFor(client);
    const identity = (await provider.resolveIdentity({ kind: "channel_id", value: CHANNEL_ID })).identity;
    const channel = await provider.getChannelEvidence(identity);
    const recent = await provider.getRecentVideoEvidence(identity, { uploadsPlaylistId: null, maxResults: 5 });

    expect(channel.normalized.subscriberCount).toBeNull();
    expect(channel.normalized.subscriberCountHidden).toBe(true);
    expect(channel.normalized.publicVideoCount).toBeNull();
    expect(recent.normalized.videos).toEqual([]);
    expect(recent.normalized.unavailableVideoIds).toEqual(["fictional-hidden-video"]);
    expect(createVerificationEvidence(channel.normalized, recent.normalized, NOW).recentVideoCount).toBe(0);
  });

  it("supports stable channel IDs, handles, and supported profile URLs", async () => {
    const client = new FictionalInnerTubeClient();
    const provider = providerFor(client);
    const inputs = [
      { kind: "channel_id" as const, value: CHANNEL_ID },
      { kind: "handle" as const, value: "@fictionalhandle" },
      { kind: "url" as const, value: "https://www.youtube.com/@fictionalhandle" },
      { kind: "url" as const, value: `https://www.youtube.com/channel/${CHANNEL_ID}` },
      { kind: "url" as const, value: "https://www.youtube.com/user/fictionaluser" },
    ];
    const resolved = await Promise.all(inputs.map((input) => provider.resolveIdentity(input)));
    expect(resolved.every((result) => result.identity.channelId === CHANNEL_ID)).toBe(true);
    expect(client.calls.resolve).toBe(inputs.length);
  });

  it("classifies required failure modes without exposing secrets or response bodies", async () => {
    const cases = [
      ["not_found", false],
      ["response_invalid", false],
      ["access_restricted", false],
      ["provider_incompatible", false],
      ["temporary", true],
    ] as const;
    for (const [category, retryable] of cases) {
      const client = new FictionalInnerTubeClient({ resolveError: new InnerTubeBridgeError(category) });
      const provider = providerFor(client, { maxRetries: 0 });
      await expect(provider.resolveIdentity({ kind: "channel_id", value: CHANNEL_ID })).rejects.toMatchObject({ category, retryable });
    }

    const secret = "secret-cookie-and-internal-response-body";
    const provider = providerFor(new FictionalInnerTubeClient({ resolveError: new Error(secret) }), { maxRetries: 0 });
    const error = await provider.resolveIdentity({ kind: "channel_id", value: CHANNEL_ID }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(YouTubeProviderError);
    expect(JSON.stringify(error)).not.toContain(secret);
    expect((error as YouTubeProviderError).message).toBe("YouTube provider operation failed.");
  });

  it("returns structured invalid-input and timeout errors", async () => {
    const provider = providerFor(new FictionalInnerTubeClient(), { requestTimeoutMs: 5, maxRetries: 0 });
    await expect(provider.resolveIdentity({ kind: "url", value: "https://www.youtube.com/watch?v=fictional" })).rejects.toMatchObject({
      category: "invalid_input", retryable: false,
    });
    const neverClient = new FictionalInnerTubeClient({ neverResolve: true });
    await expect(providerFor(neverClient, { requestTimeoutMs: 5, maxRetries: 0 }).resolveIdentity({ kind: "channel_id", value: CHANNEL_ID })).rejects.toMatchObject({
      category: "timeout", retryable: true,
    });
  });

  it("parses only explicit public counts", () => {
    expect(parsePublicCount("12.5K subscribers")).toBe(12500);
    expect(parsePublicCount("1,234 videos")).toBe(1234);
    expect(parsePublicCount("2M views")).toBe(2000000);
    expect(parsePublicCount("hidden")).toBeNull();
    expect(parsePublicCount(null)).toBeNull();
  });
});

describe("InnerTube H4 pipeline integration", () => {
  it("prechecks history before expensive evidence and keeps repeated runs idempotent", async () => {
    const repository = createRepository();
    const client = new FictionalInnerTubeClient();
    const provider = providerFor(client);
    const pipeline = new AutomaticScoutingPipeline({
      discoveryProvider: provider,
      identityProvider: provider,
      evidenceProvider: provider,
      historyRepository: repository,
      now: () => NOW,
    });
    const request = {
      runId: "innertube-fictional-run",
      query: "허구 InnerTube 검색",
      category: "뷰티",
      targetRecommendedCount: 1,
      recentVideoLimit: 5,
      settings: defaultRecommendationSettings,
    };

    const first = await pipeline.run(request);
    const expensiveCallsAfterFirst = { channel: client.calls.channel, videos: client.calls.videos };
    const repeated = await pipeline.run({ ...request, runId: "innertube-fictional-retry" });

    expect(first.results).toHaveLength(1);
    expect(first.statistics).toMatchObject({ discovered: 1, evaluated: 1, hold: 1, priorHistorySkipped: 0, sameRunDuplicatesSkipped: 0, failed: 0, stopReason: "source_exhausted" });
    expect(repository.load()).toHaveLength(1);
    expect(repeated.results).toEqual([]);
    expect(repeated.statistics).toMatchObject({ discovered: 1, evaluated: 0, priorHistorySkipped: 1, sameRunDuplicatesSkipped: 0, stopReason: "source_exhausted" });
    expect({ channel: client.calls.channel, videos: client.calls.videos }).toEqual(expensiveCallsAfterFirst);
    expect(repository.load()).toHaveLength(1);
  });

  it("does not evaluate or persist an unsupported recent-video response", async () => {
    const repository = createRepository();
    const client = new FictionalInnerTubeClient({
      videos: {
        videos: [],
        collectionState: "unsupported",
        unavailableVideoIds: [],
        raw: { changed_shape: "fictional" },
      },
    });
    const provider = providerFor(client);
    const pipeline = new AutomaticScoutingPipeline({
      discoveryProvider: provider,
      identityProvider: provider,
      evidenceProvider: provider,
      historyRepository: repository,
      now: () => NOW,
    });
    const result = await pipeline.run({
      runId: "innertube-incompatible-fictional-run",
      query: "허구 비호환 응답",
      category: "뷰티",
      targetRecommendedCount: 1,
      recentVideoLimit: 5,
      settings: defaultRecommendationSettings,
    });

    expect(result.results).toEqual([]);
    expect(result.statistics).toMatchObject({ evaluated: 0, failed: 1, recommended: 0, hold: 0, excluded: 0 });
    expect(result.failures).toContainEqual(expect.objectContaining({
      stage: "evidence_collection",
      category: "provider_incompatible",
    }));
    expect(repository.load()).toEqual([]);
  });
});

function providerConfig(overrides: Partial<InnerTubeProviderConfig> = {}): InnerTubeProviderConfig {
  return { requestTimeoutMs: 100, maxRetries: 0, retryBaseDelayMs: 0, ...overrides };
}

function environment(overrides: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  return { NODE_ENV: "test", ...overrides };
}

function providerFor(client: InnerTubeClient, overrides: Partial<InnerTubeProviderConfig> = {}): InnerTubeYouTubeProvider {
  return new InnerTubeYouTubeProvider(providerConfig(overrides), { clientFactory: async () => client, delay: async () => undefined });
}

function fictionalChannel(overrides: Partial<InnerTubeChannelSnapshot> = {}): InnerTubeChannelSnapshot {
  return {
    channelId: CHANNEL_ID,
    channelName: "허구 InnerTube 채널",
    handle: "@fictionalhandle",
    subscriberText: "12.5K subscribers",
    publicVideoCountText: "42 videos",
    raw: { fixture: "fictional-channel-raw" },
    ...overrides,
  };
}

function fictionalVideos(raw: unknown = { fixture: "fictional-videos-raw" }): InnerTubeRecentVideosSnapshot {
  return {
    videos: [
      { videoId: "fictional-video-1", publishedAt: "2026-07-20T00:00:00Z", viewCountText: "15K views", durationSeconds: 600 },
      { videoId: "fictional-video-2", publishedAt: "3 days ago", viewCountText: null, durationSeconds: null },
    ],
    collectionState: "available",
    unavailableVideoIds: ["fictional-deleted-video"],
    raw,
  };
}

interface FictionalClientOptions {
  channel?: InnerTubeChannelSnapshot;
  videos?: InnerTubeRecentVideosSnapshot;
  rawChannel?: unknown;
  rawVideos?: unknown;
  resolveError?: Error;
  neverResolve?: boolean;
}

class FictionalInnerTubeClient implements InnerTubeClient {
  readonly calls = { discovery: 0, resolve: 0, channel: 0, videos: 0 };
  private readonly channel: InnerTubeChannelSnapshot;
  private readonly videos: InnerTubeRecentVideosSnapshot;

  constructor(private readonly options: FictionalClientOptions = {}) {
    this.channel = options.channel ?? fictionalChannel({ raw: options.rawChannel ?? { fixture: "fictional-channel-raw" } });
    this.videos = options.videos ?? fictionalVideos(options.rawVideos);
  }

  async discoverChannels(query: string): Promise<InnerTubeDiscoverySnapshot> {
    this.calls.discovery += 1;
    return { channels: [{ channelId: CHANNEL_ID, channelName: this.channel.channelName }], nextPageToken: null, raw: { query, fixture: true } };
  }

  async resolveChannel(): Promise<InnerTubeChannelSnapshot> {
    this.calls.resolve += 1;
    if (this.options.neverResolve) return new Promise<InnerTubeChannelSnapshot>(() => undefined);
    if (this.options.resolveError) throw this.options.resolveError;
    return this.channel;
  }

  async getChannel(): Promise<InnerTubeChannelSnapshot> {
    this.calls.channel += 1;
    return this.channel;
  }

  async getRecentVideos(): Promise<InnerTubeRecentVideosSnapshot> {
    this.calls.videos += 1;
    return this.videos;
  }
}

function createRepository(): SqliteHistoryRepository {
  const database = openDatabase(":memory:");
  databases.push(database);
  return new SqliteHistoryRepository(database);
}
