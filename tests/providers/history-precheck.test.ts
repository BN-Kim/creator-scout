import { afterEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import { openDatabase } from "@/server/database/database";
import { createHistoryRecord } from "@/server/history/history-record";
import { SqliteHistoryRepository } from "@/server/history/sqlite-history-repository";
import type { YouTubeEvidenceProvider, YouTubeIdentityProvider } from "@/server/providers/youtube/provider-contracts";
import { HistoryPrecheckedYouTubeEvidenceCollector } from "@/server/providers/youtube/history-prechecked-evidence";
import type { NormalizedChannelEvidence, RecentVideoEvidence, ResolvedYouTubeIdentity } from "@/server/providers/youtube/provider-types";
import { evaluateMockRun } from "@/lib/mock-run";
import { MOCK_CHANNEL_ID, SECOND_MOCK_CHANNEL_ID } from "./test-helpers";

const databases: Database.Database[] = [];

afterEach(() => {
  for (const database of databases.splice(0)) database.close();
});

describe("history-prechecked YouTube evidence collection", () => {
  it("silently skips a stable prior-history identity before evidence collection", async () => {
    const { repository } = createRepository();
    const existingCreator = evaluateMockRun([])[0];
    const existingRecord = createHistoryRecord({
      ...existingCreator,
      identity: {
        ...existingCreator.identity,
        youtubeChannelId: MOCK_CHANNEL_ID,
        canonicalChannelUrl: `https://www.youtube.com/channel/${MOCK_CHANNEL_ID}`,
        youtubeHandle: "@fictionalmock",
      },
    }, "prior-run");
    repository.addOrUpdate(existingRecord);
    const before = repository.load();
    const providers = providerDoubles(resolvedIdentity(MOCK_CHANNEL_ID));
    const collector = new HistoryPrecheckedYouTubeEvidenceCollector(providers.identity, providers.evidence, repository);
    const outcome = await collector.collect({ kind: "handle", value: "@fictionalmock" });
    expect(outcome).toMatchObject({
      kind: "skipped_history", skipReason: "prior_history", matchedHistoryRecordId: existingRecord.id,
      decision: null, evidence: null,
    });
    expect(providers.calls.channelEvidence).toBe(0);
    expect(providers.calls.recentVideos).toBe(0);
    expect(repository.load()).toEqual(before);
  });

  it("does not use a matching channel name as a stable history match", async () => {
    const { repository } = createRepository();
    const existingCreator = evaluateMockRun([])[0];
    repository.addOrUpdate(createHistoryRecord({
      ...existingCreator,
      identity: { ...existingCreator.identity, channelName: "허구 목 채널", normalizedChannelName: "허구목채널", youtubeChannelId: MOCK_CHANNEL_ID },
    }, "prior-run"));
    const providers = providerDoubles({ ...resolvedIdentity(SECOND_MOCK_CHANNEL_ID), channelName: "허구 목 채널" });
    const collector = new HistoryPrecheckedYouTubeEvidenceCollector(providers.identity, providers.evidence, repository);
    const outcome = await collector.collect({ kind: "channel_id", value: SECOND_MOCK_CHANNEL_ID }, { now: new Date("2026-07-22T00:00:00Z") });
    expect(outcome.kind).toBe("evidence_collected");
    expect(providers.calls.channelEvidence).toBe(1);
  });

  it("allows a new stable identity to collect evidence without making a decision or writing history", async () => {
    const { repository } = createRepository();
    const providers = providerDoubles(resolvedIdentity(SECOND_MOCK_CHANNEL_ID));
    const collector = new HistoryPrecheckedYouTubeEvidenceCollector(providers.identity, providers.evidence, repository);
    const outcome = await collector.collect({ kind: "channel_id", value: SECOND_MOCK_CHANNEL_ID }, { now: new Date("2026-07-22T00:00:00Z") });
    expect(outcome).toMatchObject({ kind: "evidence_collected", decision: null });
    if (outcome.kind === "evidence_collected") {
      expect(outcome.evidence.verificationEvidence.evidenceSource).toBe("fictional_mock");
      expect(outcome.raw).toEqual({ identity: { fixture: "identity" }, channel: { fixture: "channel" }, recentVideos: { fixture: "videos" } });
    }
    expect(providers.calls.channelEvidence).toBe(1);
    expect(providers.calls.recentVideos).toBe(1);
    expect(repository.load()).toEqual([]);
  });
});

function createRepository(): { repository: SqliteHistoryRepository } {
  const database = openDatabase(":memory:");
  databases.push(database);
  return { repository: new SqliteHistoryRepository(database) };
}

function resolvedIdentity(channelId: string): ResolvedYouTubeIdentity {
  return {
    channelId,
    channelName: "허구 목 채널",
    handle: "@fictionalmock",
    canonicalChannelUrl: `https://www.youtube.com/channel/${channelId}`,
    resolvedFrom: "channel_id",
  };
}

function providerDoubles(resolved: ResolvedYouTubeIdentity): {
  identity: YouTubeIdentityProvider;
  evidence: YouTubeEvidenceProvider;
  calls: { channelEvidence: number; recentVideos: number };
} {
  const calls = { channelEvidence: 0, recentVideos: 0 };
  const channel: NormalizedChannelEvidence = {
    evidenceSource: "fictional_mock",
    channelId: resolved.channelId,
    channelName: resolved.channelName,
    handle: resolved.handle,
    canonicalChannelUrl: resolved.canonicalChannelUrl,
    subscriberCount: null,
    subscriberCountHidden: true,
    publicVideoCount: 0,
    channelPublishedAt: null,
    country: null,
    uploadsPlaylistId: "UUfictionaluploads",
  };
  const recentVideos: RecentVideoEvidence = {
    videos: [], shortsLengthSamples: [], longFormLengthSamples: [], unknownDurationSamples: [], unavailableVideoIds: [],
  };
  return {
    identity: { resolveIdentity: async () => ({ identity: resolved, raw: { fixture: "identity" } }) },
    evidence: {
      getChannelEvidence: async () => { calls.channelEvidence += 1; return { normalized: channel, raw: { fixture: "channel" } }; },
      getRecentVideoEvidence: async () => { calls.recentVideos += 1; return { normalized: recentVideos, raw: { fixture: "videos" } }; },
    },
    calls,
  };
}
