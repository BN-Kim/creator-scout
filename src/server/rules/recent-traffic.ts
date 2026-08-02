import type { RecommendationSettings, VerificationEvidence } from "@/types/domain";

export interface TrafficEvaluation {
  average: number | null;
  trimmedAverage: number | null;
  representativeAverage: number | null;
  median: number | null;
  sampleSize: number;
  complete: boolean;
  viralDistortion: boolean;
  belowThreshold: boolean;
  reachQualified: boolean;
  efficientSmallCreator: boolean;
  viewSubscriberRatio: number | null;
}

export function evaluateRecentTraffic(
  evidence: VerificationEvidence,
  settings: RecommendationSettings,
): TrafficEvaluation {
  const sample = (evidence.recentViewCounts ?? []).slice(0, settings.extendedRecentAverageWindow);
  const average = sample.length > 0
    ? sample.reduce((sum, value) => sum + value, 0) / sample.length
    : evidence.recentAverageViews;
  const sorted = [...sample].sort((left, right) => left - right);
  const median = calculateMedian(sorted);
  const trimmed = sorted.length >= 5 ? sorted.slice(1, -1) : sorted;
  const trimmedAverage = trimmed.length > 0
    ? trimmed.reduce((sum, value) => sum + value, 0) / trimmed.length
    : null;
  const representativeAverage = trimmedAverage ?? average;
  const computedViralDistortion = sorted.length >= 3
    && (median ?? 0) > 0
    && Math.max(...sorted) >= (median ?? 0) * 5;
  const viralDistortion = evidence.viralVideoDistortionRisk === true || computedViralDistortion;
  const requiredSampleSize = evidence.recentVideoCount === null
    ? settings.defaultRecentAverageWindow
    : Math.min(settings.defaultRecentAverageWindow, evidence.recentVideoCount);
  const hasComparableSample = sample.length >= requiredSampleSize
    || (sample.length === 0 && evidence.recentAverageViews !== null);
  const complete = requiredSampleSize >= settings.minimumRecentVideoCount
    && hasComparableSample;
  const representativeViews = median ?? representativeAverage;
  const viewSubscriberRatio = representativeViews !== null
    && evidence.subscriberCount !== null
    && evidence.subscriberCount > 0
    ? representativeViews / evidence.subscriberCount
    : null;
  const subscriberInTargetRange = evidence.subscriberCount !== null
    && evidence.subscriberCount >= settings.minimumSubscriberCount
    && evidence.subscriberCount <= settings.maximumSubscriberCount;
  const efficientSmallCreator = subscriberInTargetRange
    && median !== null
    && median >= settings.minimumEfficientCreatorMedianViews
    && viewSubscriberRatio !== null
    && viewSubscriberRatio >= settings.minimumViewSubscriberRatio;
  const reachQualified = complete && (
    (median !== null && median >= settings.minimumRecentMedianViews)
    || (representativeAverage !== null && representativeAverage >= settings.minimumRecentAverageViews)
    || efficientSmallCreator
  );

  return {
    average,
    trimmedAverage,
    representativeAverage,
    median,
    sampleSize: sample.length,
    complete,
    viralDistortion,
    belowThreshold: complete && !reachQualified,
    reachQualified,
    efficientSmallCreator,
    viewSubscriberRatio,
  };
}

function calculateMedian(sorted: readonly number[]): number | null {
  if (sorted.length === 0) return null;
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle] ?? null;
  return ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}
