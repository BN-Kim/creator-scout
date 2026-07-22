import type { NormalizedChannelEvidence, RecentVideoEvidence } from "@/server/providers/youtube/provider-types";
import { createUncheckedRecruitmentEvidence } from "@/server/providers/recruitment/approved-public-provider";
import type { ContentType, VerificationEvidence } from "@/types/domain";

export function createVerificationEvidence(
  channel: NormalizedChannelEvidence,
  recentVideos: RecentVideoEvidence,
  verifiedAt = new Date(),
): VerificationEvidence {
  const publishedDates = recentVideos.videos.flatMap((video) => video.publishedAt ? [video.publishedAt] : []);
  const latestUploadDate = publishedDates.sort((left, right) => right.localeCompare(left))[0] ?? null;
  const viewCounts = recentVideos.videos.map((video) => video.viewCount);
  const completeViewCounts = viewCounts.length > 0 && viewCounts.every((value): value is number => value !== null) ? viewCounts : null;
  const recentAverageViews = completeViewCounts
    ? Math.round(completeViewCounts.reduce((total, value) => total + value, 0) / completeViewCounts.length)
    : null;
  return {
    channelExists: true,
    channelNameMatches: null,
    confirmedChannelUrl: channel.canonicalChannelUrl,
    videosExist: recentVideos.videos.length > 0 ? true : channel.publicVideoCount === 0 ? false : null,
    latestUploadDate,
    latestUploadConfirmed: latestUploadDate ? true : null,
    recentVideoCount: recentVideos.videos.length,
    recentVideoUrls: recentVideos.videos.map((video) => `https://www.youtube.com/watch?v=${video.videoId}`),
    recentViewCounts: completeViewCounts,
    recentAverageViews,
    subscriberCount: channel.subscriberCount,
    uploadConsistency: null,
    contentType: contentType(recentVideos),
    categoryFit: null,
    koreanAudienceSuitable: null,
    foreignAudienceRisk: null,
    overseasBaseRisk: null,
    celebrityRisk: null,
    officialChannelRisk: null,
    companyChannelRisk: null,
    brandChannelRisk: null,
    corporateChannelRisk: null,
    agencyRisk: null,
    managementRisk: null,
    mcnRisk: null,
    labelRisk: null,
    reuploadRisk: null,
    compilationRisk: null,
    contentFarmRisk: null,
    viralVideoDistortionRisk: null,
    visibleEmail: null,
    emailVerificationState: "not_checked",
    emailClassification: "not_checked",
    recruitmentSuitability: null,
    recruitmentEvidence: createUncheckedRecruitmentEvidence(),
    evidenceSource: channel.evidenceSource,
    verifiedAt: verifiedAt.toISOString(),
  };
}

function contentType(recentVideos: RecentVideoEvidence): ContentType {
  if (recentVideos.shortsLengthSamples.length && recentVideos.longFormLengthSamples.length) return "mixed";
  if (recentVideos.shortsLengthSamples.length && !recentVideos.unknownDurationSamples.length) return "shorts";
  if (recentVideos.longFormLengthSamples.length && !recentVideos.unknownDurationSamples.length) return "long_form";
  return "unknown";
}
