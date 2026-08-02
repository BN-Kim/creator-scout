import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import { openDatabase } from "@/server/database/database";
import { SqliteHistoryRepository } from "@/server/history/sqlite-history-repository";
import type { HistoryRecord } from "@/types/domain";

const temporaryDirectories: string[] = [];
const SCRIPT = resolve("scripts/repair-youtubejs-zero-video-history.mjs");
const INNER_RUN = "automatic-fictional-innertube-run";

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("YouTube.js zero-video history repair command", () => {
  it("defaults to dry-run and applies only explicitly confirmed InnerTube-run records", () => {
    const directory = mkdtempSync(join(tmpdir(), "creator-history-repair-"));
    temporaryDirectories.push(directory);
    const databasePath = join(directory, "history.sqlite");
    const database = openDatabase(databasePath);
    const repository = new SqliteHistoryRepository(database);
    repository.addOrUpdateMany([
      record("UCfictionalEligible00001", "허구 복구 대상", INNER_RUN, "2026-07-22T12:00:00.000Z", 0),
      record("UCfictionalOtherRun0002", "허구 다른 공급자", "automatic-fictional-official-run", "2026-07-22T12:00:00.000Z", 0),
      record("UCfictionalNonZero00003", "허구 영상 보유", INNER_RUN, "2026-07-22T12:00:00.000Z", 1),
    ]);
    database.close();

    const dryRun = run(databasePath, ["--innertube-run-id", INNER_RUN]);
    expect(dryRun.status).toBe(0);
    expect(dryRun.stdout).toContain("DRY-RUN (변경 없음)");
    expect(dryRun.stdout).toContain("영향 후보: 1개");
    expect(dryRun.stdout).toContain("UCfictionalEligible00001 | 허구 복구 대상");
    expect(load(databasePath)).toHaveLength(3);

    const applied = run(databasePath, [
      "--innertube-run-id", INNER_RUN,
      "--confirm-channel-id", "UCfictionalEligible00001",
      "--apply",
    ]);
    expect(applied.status).toBe(0);
    expect(applied.stdout).toContain("적용 완료: 확인된 오판 레코드 1개를 제거했습니다.");
    expect(load(databasePath).map((item) => item.identity.youtubeChannelId).sort()).toEqual([
      "UCfictionalNonZero00003", "UCfictionalOtherRun0002",
    ]);
  });
});

function run(databasePath: string, args: string[]): ReturnType<typeof spawnSync> {
  return spawnSync(process.execPath, [SCRIPT, "--database", databasePath, ...args], { encoding: "utf8" });
}

function load(databasePath: string): HistoryRecord[] {
  const database = openDatabase(databasePath);
  try { return new SqliteHistoryRepository(database).load(); } finally { database.close(); }
}

function record(channelId: string, channelName: string, runId: string, createdAt: string, videoCount: number): HistoryRecord {
  return {
    id: `history-youtube:${channelId}`,
    identity: {
      internalId: `youtube:${channelId}`,
      channelName,
      normalizedChannelName: channelName,
      confirmedAliases: [],
      canonicalChannelUrl: `https://www.youtube.com/channel/${channelId}`,
      youtubeChannelId: channelId,
      youtubeHandle: null,
      sourceUrls: [`https://www.youtube.com/channel/${channelId}`],
      category: "허구 테스트",
      identityVerificationState: "confirmed",
    },
    historyStatus: "excluded",
    finalDecision: "excluded",
    category: "허구 테스트",
    reasonCodes: ["insufficient_recent_video_count"],
    koreanExplanation: "허구 테스트 제외",
    evidenceSummary: `검증 ${createdAt} · 최근 영상 ${videoCount}개 · 최근 평균 조회 미확인`,
    scoutingRunId: runId,
    createdAt,
    updatedAt: createdAt,
    manualCorrection: null,
    fitScore: null,
    scoreComponents: null,
    contactReady: null,
    ruleVersion: "legacy",
    recheckAt: null,
    appliedSettings: null,
    decisionSource: "system",
  };
}
