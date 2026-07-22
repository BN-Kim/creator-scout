import type { YouTubeRecruitmentSnapshot } from "@/server/providers/recruitment/live-source-types";
import type { KoreanLanguageActivityEvidence, RecruitmentEvidenceSource } from "@/types/domain";

const hangulPattern = /[\uAC00-\uD7A3]/gu;
const eligibleCharacterPattern = /[\p{L}\p{N}]/gu;
const koreanActivityPattern = /(?:(?:대한민국|한국|서울|부산|대구|인천|광주|대전|울산|제주)(?:에서\s*(?:활동|제작|만들|촬영|거주)|\s*(?:기반|소재|활동)))|(?:(?:based|located|active)\s+in\s+(?:south\s+korea|republic\s+of\s+korea|korea|seoul))/iu;

export function evaluateKoreanLanguageActivity(
  snapshot: YouTubeRecruitmentSnapshot,
  verifiedAt: string,
): KoreanLanguageActivityEvidence {
  const titles = snapshot.recentVideos.map((video) => video.title.trim()).filter(Boolean).slice(0, 20);
  const recentTitleHangulPresenceRatio = titles.length
    ? roundRatio(titles.filter((title) => containsHangul(title)).length / titles.length)
    : null;
  const corpus = [
    snapshot.channelTitle,
    snapshot.channelDescription,
    ...snapshot.recentVideos.flatMap((video) => [video.title, video.description]),
  ].filter((value): value is string => Boolean(value?.trim())).join(" ");
  const eligibleCharacters = corpus.match(eligibleCharacterPattern)?.length ?? 0;
  const hangulCharacters = corpus.match(hangulPattern)?.length ?? 0;
  const hangulCharacterRatio = eligibleCharacters ? roundRatio(hangulCharacters / eligibleCharacters) : null;
  const explicitKoreanCountryOrActivityEvidence = explicitKoreanEvidence(snapshot, corpus);
  return {
    recentTitleHangulPresenceRatio,
    hangulCharacterRatio,
    explicitKoreanCountryOrActivityEvidence,
    countryMetadata: snapshot.country,
    languageMetadata: snapshot.language,
    state: activityState(
      titles.length,
      recentTitleHangulPresenceRatio,
      hangulCharacterRatio,
      explicitKoreanCountryOrActivityEvidence,
    ),
    verifiedAt,
    sources: activitySources(snapshot),
  };
}

function explicitKoreanEvidence(snapshot: YouTubeRecruitmentSnapshot, corpus: string): boolean | null {
  const country = snapshot.country?.trim().toLowerCase() ?? null;
  const language = snapshot.language?.trim().toLowerCase() ?? null;
  if (country && ["kr", "kor", "korea", "south korea", "republic of korea"].includes(country)) return true;
  if (language && (language === "ko" || language.startsWith("ko-"))) return true;
  if (koreanActivityPattern.test(corpus)) return true;
  return corpus || country || language ? false : null;
}

function activityState(
  titleCount: number,
  titleRatio: number | null,
  characterRatio: number | null,
  explicitEvidence: boolean | null,
): KoreanLanguageActivityEvidence["state"] {
  if (explicitEvidence === true || (titleRatio !== null && titleRatio >= 0.6) || (characterRatio !== null && characterRatio >= 0.3)) {
    return "likely";
  }
  if (titleCount >= 5 && titleRatio !== null && titleRatio <= 0.1
    && characterRatio !== null && characterRatio < 0.05 && explicitEvidence === false) {
    return "unlikely";
  }
  return "unclear";
}

function activitySources(snapshot: YouTubeRecruitmentSnapshot): RecruitmentEvidenceSource[] {
  const channelSource: RecruitmentEvidenceSource = {
    sourceId: `youtube-channel:${snapshot.channelId}`,
    sourceType: "youtube_channel_about",
    publicUrl: `https://www.youtube.com/channel/${snapshot.channelId}`,
    approved: true,
  };
  const videoSources = snapshot.recentVideos.slice(0, 20).map((video): RecruitmentEvidenceSource => ({
    sourceId: `youtube-video:${video.videoId}`,
    sourceType: "youtube_video_description",
    publicUrl: `https://www.youtube.com/watch?v=${video.videoId}`,
    approved: true,
  }));
  return [channelSource, ...videoSources];
}

function containsHangul(value: string): boolean {
  hangulPattern.lastIndex = 0;
  return hangulPattern.test(value);
}

function roundRatio(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}
