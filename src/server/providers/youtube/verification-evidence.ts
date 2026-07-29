import type {
  NormalizedChannelEvidence,
  RecentVideoEvidence,
  RecentVideoWindow,
} from "@/server/providers/youtube/provider-types";
import { createUncheckedRecruitmentEvidence } from "@/server/providers/recruitment/approved-public-provider";
import type { ContentType, VerificationEvidence } from "@/types/domain";

export function createVerificationEvidence(
  channel: NormalizedChannelEvidence,
  recentVideos: RecentVideoEvidence,
  verifiedAt = new Date(),
  window?: RecentVideoWindow,
): VerificationEvidence {
  const publishedDates = recentVideos.videos.flatMap((video) => video.publishedAt ? [video.publishedAt] : []);
  const latestUploadDate = publishedDates.sort((left, right) => right.localeCompare(left))[0] ?? null;
  const eligibleVideos = window
    ? recentVideos.videos.filter((video) => isWithinWindow(video.publishedAt, verifiedAt, window.maximumDaysSinceLatestUpload))
    : recentVideos.videos;
  const metricEvidenceComplete = recentVideos.unavailableVideoIds.length === 0
    && recentVideos.videos.every((video) => video.publishedAt !== null);
  const recentVideoCount = metricEvidenceComplete ? eligibleVideos.length : null;
  const viewSample = eligibleVideos.slice(0, window?.averageViewSampleSize ?? eligibleVideos.length);
  const viewCounts = viewSample.map((video) => video.viewCount);
  const completeViewCounts = viewCounts.length > 0
    && viewCounts.every((value): value is number => value !== null) ? viewCounts : null;
  const recentAverageViews = completeViewCounts
    ? Math.round(completeViewCounts.reduce((total, value) => total + value, 0) / completeViewCounts.length)
    : null;
  return {
    channelExists: true,
    channelNameMatches: null,
    confirmedChannelUrl: channel.canonicalChannelUrl,
    videosExist: channel.publicVideoCount === 0 ? false : channel.publicVideoCount !== null ? true : recentVideos.videos.length > 0 ? true : null,
    latestUploadDate,
    latestUploadConfirmed: latestUploadDate ? true : null,
    recentVideoCount,
    recentVideoUrls: eligibleVideos.map((video) => `https://www.youtube.com/watch?v=${video.videoId}`),
    recentViewCounts: completeViewCounts,
    recentAverageViews,
    subscriberCount: channel.subscriberCount,
    uploadConsistency: null,
    contentType: contentType({
      ...recentVideos,
      videos: eligibleVideos,
      shortsLengthSamples: eligibleVideos.filter((video) => video.durationClass === "shorts_length"),
      longFormLengthSamples: eligibleVideos.filter((video) => video.durationClass === "long_form_length"),
      unknownDurationSamples: eligibleVideos.filter((video) => video.durationClass === "unknown"),
    }),
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

function isWithinWindow(publishedAt: string | null, verifiedAt: Date, maximumDays: number): boolean {
  if (!publishedAt) return false;
  const publishedAtMs = Date.parse(publishedAt);
  if (Number.isNaN(publishedAtMs)) return false;
  const cutoffMs = verifiedAt.getTime() - maximumDays * 24 * 60 * 60 * 1_000;
  return publishedAtMs >= cutoffMs && publishedAtMs <= verifiedAt.getTime();
}

function contentType(recentVideos: RecentVideoEvidence): ContentType {
  if (recentVideos.shortsLengthSamples.length && recentVideos.longFormLengthSamples.length) return "mixed";
  if (recentVideos.shortsLengthSamples.length && !recentVideos.unknownDurationSamples.length) return "shorts";
  if (recentVideos.longFormLengthSamples.length && !recentVideos.unknownDurationSamples.length) return "long_form";
  return "unknown";
}
