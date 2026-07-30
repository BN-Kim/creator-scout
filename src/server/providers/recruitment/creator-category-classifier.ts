import { discoveryTaxonomy, isApprovedCategory } from "@/server/discovery/discovery-taxonomy";
import type { YouTubeRecruitmentSnapshot } from "@/server/providers/recruitment/live-source-types";
import type { CreatorCategoryEvidence, RecruitmentEvidenceSource } from "@/types/domain";

const minimumConfirmedScore = 6;
const minimumWinningMargin = 2;
const nonTargetCategory = "비대상";

const categoryTerms: Readonly<Record<string, readonly string[]>> = {
  뷰티: ["뷰티", "메이크업", "화장품", "스킨케어", "헤어", "네일"],
  패션: ["패션", "코디", "스타일링", "데일리룩", "옷", "가방", "신발"],
  푸드: ["푸드", "요리", "레시피", "맛집", "먹방", "베이킹", "카페"],
  테크: ["테크", "IT", "디지털 기기", "스마트폰", "노트북", "컴퓨터", "가전"],
  라이프스타일: ["라이프스타일", "일상", "살림", "집꾸미기", "육아", "루틴"],
  여행: ["여행", "관광", "숙소", "호텔", "캠핑", "해외여행", "국내여행"],
  [nonTargetCategory]: ["웹드라마", "드라마", "숏드라마", "예능 제작", "콘텐츠 제작"],
};

const explicitCompanyPatterns: readonly RegExp[] = [
  /웹\s*드라마\s*제작사/iu,
  /콘텐츠\s*제작사/iu,
  /영상\s*제작사/iu,
  /(?:프로덕션|production)\b/iu,
  /주식\s*회사|㈜|\(주\)/iu,
  /기업\s*공식\s*채널/iu,
  /브랜드\s*공식\s*채널/iu,
];

interface WeightedText {
  text: string;
  weight: number;
  source: RecruitmentEvidenceSource;
  signalPrefix: string;
}

export function classifyCreatorCategory(
  snapshot: YouTubeRecruitmentSnapshot,
  verifiedAt: string,
): CreatorCategoryEvidence {
  const channelSource = sourceForChannel(snapshot.channelId);
  const weightedTexts: WeightedText[] = [
    { text: snapshot.channelTitle, weight: 3, source: channelSource, signalPrefix: "채널명" },
    { text: snapshot.channelDescription ?? "", weight: 5, source: channelSource, signalPrefix: "채널 설명" },
    ...snapshot.recentVideos.slice(0, 20).flatMap((video): WeightedText[] => [
      {
        text: video.title,
        weight: 2,
        source: sourceForVideo(video.videoId),
        signalPrefix: "최근 영상 제목",
      },
      {
        text: video.description ?? "",
        weight: 0.25,
        source: sourceForVideo(video.videoId),
        signalPrefix: "최근 영상 설명",
      },
    ]),
  ];
  const scores: Record<string, number> = Object.fromEntries(
    [...discoveryTaxonomy.categories.map((category) => category.name), nonTargetCategory]
      .map((category) => [category, 0]),
  );
  const matchedSignals = new Set<string>();
  const matchedSources = new Map<string, RecruitmentEvidenceSource>();

  for (const item of weightedTexts) {
    const normalized = normalizeText(item.text);
    if (!normalized) continue;
    for (const [category, terms] of Object.entries(categoryTerms)) {
      const matches = terms.filter((term) => includesTerm(normalized, term));
      if (matches.length === 0) continue;
      scores[category] = (scores[category] ?? 0) + item.weight * Math.min(matches.length, 2);
      matchedSignals.add(`${item.signalPrefix}: ${matches[0]}`);
      matchedSources.set(item.source.sourceId, item.source);
    }
  }

  const description = snapshot.channelDescription ?? "";
  const companySignals = explicitCompanyPatterns.flatMap((pattern) => {
    const match = description.match(pattern);
    return match ? [match[0].normalize("NFKC")] : [];
  });
  const companyChannelConfirmed = companySignals.length > 0 ? true : null;
  if (companySignals.length > 0) {
    scores[nonTargetCategory] = Math.max(scores[nonTargetCategory] ?? 0, 12);
    for (const signal of companySignals) matchedSignals.add(`채널 설명: ${signal}`);
    matchedSources.set(channelSource.sourceId, channelSource);
  }

  const ranked = Object.entries(scores).sort((left, right) =>
    right[1] - left[1] || left[0].localeCompare(right[0], "ko-KR"),
  );
  const winner = ranked[0] ?? [nonTargetCategory, 0];
  const runnerUpScore = ranked[1]?.[1] ?? 0;
  const verifiedCategory = winner[1] >= minimumConfirmedScore
    && winner[1] - runnerUpScore >= minimumWinningMargin
    && (winner[0] === nonTargetCategory || isApprovedCategory(winner[0]))
    ? winner[0]
    : null;

  return {
    verifiedCategory,
    verificationState: verifiedCategory ? "confirmed" : "unconfirmed",
    companyChannelConfirmed,
    scores: Object.fromEntries(Object.entries(scores).map(([category, score]) => [
      category,
      Math.round(score * 100) / 100,
    ])),
    matchedSignals: [...matchedSignals].sort((left, right) => left.localeCompare(right, "ko-KR")),
    verifiedAt,
    sources: [...matchedSources.values()],
  };
}

function normalizeText(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("ko-KR").replace(/\s+/g, " ").trim();
}

function includesTerm(normalizedText: string, term: string): boolean {
  const normalizedTerm = normalizeText(term);
  if (!/^[a-z0-9 ]+$/i.test(normalizedTerm)) return normalizedText.includes(normalizedTerm);
  const escaped = normalizedTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?=$|[^a-z0-9])`, "i").test(normalizedText);
}

function sourceForChannel(channelId: string): RecruitmentEvidenceSource {
  return {
    sourceId: `youtube-channel:${channelId}`,
    sourceType: "youtube_channel_about",
    publicUrl: `https://www.youtube.com/channel/${channelId}`,
    approved: true,
  };
}

function sourceForVideo(videoId: string): RecruitmentEvidenceSource {
  return {
    sourceId: `youtube-video:${videoId}`,
    sourceType: "youtube_video_description",
    publicUrl: `https://www.youtube.com/watch?v=${videoId}`,
    approved: true,
  };
}
