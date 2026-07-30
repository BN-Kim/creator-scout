import { describe, expect, it } from "vitest";
import { createUncheckedRecruitmentEvidence } from "@/server/providers/recruitment/approved-public-provider";
import { classifyCreatorCategory } from "@/server/providers/recruitment/creator-category-classifier";
import type { YouTubeRecruitmentSnapshot } from "@/server/providers/recruitment/live-source-types";
import { createVerificationEvidence } from "@/server/providers/youtube/verification-evidence";
import type {
  CollectedYouTubeEvidence,
  NormalizedChannelEvidence,
  RecentVideoEvidence,
  ResolvedYouTubeIdentity,
} from "@/server/providers/youtube/provider-types";
import { createCreatorInputFromYouTubeEvidence } from "@/server/scouting/creator-input-assembler";

const checkedAt = "2026-07-30T09:00:00.000Z";
const channelId = `UC${"c".repeat(22)}`;

describe("creator category classification", () => {
  it("classifies an explicitly disclosed web-drama production company as non-target organization evidence", () => {
    const evidence = classifyCreatorCategory(snapshot({
      channelTitle: "허구 PANG STUDIO",
      channelDescription: "한국 웹드라마 제작사 허구 팡스튜디오입니다.",
      recentVideos: videos(["허구 에피소드 1", "허구 에피소드 2", "허구 에피소드 3"]),
    }), checkedAt);

    expect(evidence).toMatchObject({
      verifiedCategory: "비대상",
      verificationState: "confirmed",
      companyChannelConfirmed: true,
    });
    expect(evidence.matchedSignals).toContain("채널 설명: 웹드라마 제작사");
    expect(evidence.sources.map((source) => source.sourceId)).toContain(`youtube-channel:${channelId}`);
  });

  it("confirms a food creator only from repeated first-party food metadata", () => {
    const evidence = classifyCreatorCategory(snapshot({
      channelTitle: "허구 집밥 연구소",
      channelDescription: "매주 요리 레시피와 베이킹 과정을 공개합니다.",
      recentVideos: videos(["초보 김치찌개 레시피", "주말 베이킹 레시피", "간단한 집밥 요리"]),
    }), checkedAt);

    expect(evidence.verifiedCategory).toBe("푸드");
    expect(evidence.companyChannelConfirmed).toBeNull();
    expect(evidence.scores.푸드).toBeGreaterThan(6);
  });

  it("keeps ambiguous metadata unclassified instead of copying the discovery category", () => {
    const evidence = classifyCreatorCategory(snapshot({
      channelTitle: "허구 오늘의 기록",
      channelDescription: "New stories with weekly videos. 매주 새로운 영상을 올립니다.",
      recentVideos: videos(["첫 번째 이야기", "두 번째 이야기"]),
    }), checkedAt);

    expect(evidence).toMatchObject({
      verifiedCategory: null,
      verificationState: "unconfirmed",
      companyChannelConfirmed: null,
    });
    expect(evidence.scores.테크).toBe(0);
  });

  it("keeps discovery and verified categories separate at the creator-input boundary", () => {
    const categoryEvidence = classifyCreatorCategory(snapshot({
      channelTitle: "허구 드라마 스튜디오",
      channelDescription: "공개 웹드라마 제작사입니다.",
      recentVideos: videos(["허구 드라마 1화", "허구 드라마 2화"]),
    }), checkedAt);
    const recruitment = createUncheckedRecruitmentEvidence();
    recruitment.categoryEvidence = categoryEvidence;

    const creator = createCreatorInputFromYouTubeEvidence(
      identity(),
      collectedEvidence(),
      { category: "푸드", sourceQuery: "허구 푸드 브이로그" },
      recruitment,
    );

    expect(creator.identity).toMatchObject({
      discoveryCategory: "푸드",
      category: "비대상",
    });
    expect(creator.evidence.categoryFit).toBe(false);
    expect(creator.evidence.companyChannelRisk).toBe(true);
  });
});

function snapshot(
  patch: Partial<YouTubeRecruitmentSnapshot>,
): YouTubeRecruitmentSnapshot {
  return {
    channelId,
    channelTitle: "허구 채널",
    channelDescription: null,
    country: "KR",
    language: "ko",
    officialLinks: [],
    recentVideos: [],
    descriptionCollection: { channel: "available", recentVideos: "available" },
    stopReasons: [],
    ...patch,
  };
}

function videos(titles: string[]): YouTubeRecruitmentSnapshot["recentVideos"] {
  return titles.map((title, index) => ({
    videoId: `fictional-category-video-${index}`,
    title,
    description: "허구 테스트 설명",
  }));
}

function identity(): ResolvedYouTubeIdentity {
  return {
    channelId,
    channelName: "허구 드라마 스튜디오",
    handle: "@fictional-category",
    canonicalChannelUrl: `https://www.youtube.com/channel/${channelId}`,
    resolvedFrom: "channel_id",
  };
}

function collectedEvidence(): CollectedYouTubeEvidence {
  const channel: NormalizedChannelEvidence = {
    evidenceSource: "fictional_mock",
    channelId,
    channelName: "허구 드라마 스튜디오",
    handle: "@fictional-category",
    canonicalChannelUrl: `https://www.youtube.com/channel/${channelId}`,
    subscriberCount: 10000,
    subscriberCountHidden: false,
    publicVideoCount: 3,
    channelPublishedAt: "2025-01-01T00:00:00.000Z",
    country: "KR",
    uploadsPlaylistId: `UU${"c".repeat(22)}`,
  };
  const recentVideos: RecentVideoEvidence = {
    videos: [],
    shortsLengthSamples: [],
    longFormLengthSamples: [],
    unknownDurationSamples: [],
    unavailableVideoIds: [],
  };
  return {
    channel,
    recentVideos,
    verificationEvidence: createVerificationEvidence(channel, recentVideos, new Date(checkedAt)),
  };
}
