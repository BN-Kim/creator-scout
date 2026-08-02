import { evaluateRecentTraffic, type TrafficEvaluation } from "@/server/rules/recent-traffic";
import type {
  CreatorInput,
  FitScoreComponents,
  RecommendationSettings,
} from "@/types/domain";

export interface CreatorFitScore {
  fitScore: number;
  scoreComponents: FitScoreComponents;
  contactReady: boolean;
  categoryQualified: boolean;
  koreanMarketQualified: boolean;
  activityQualified: boolean;
  reachQualified: boolean;
  subscriberInTargetRange: boolean;
  traffic: TrafficEvaluation;
}

export function scoreCreatorFit(
  input: CreatorInput,
  settings: RecommendationSettings,
  now: Date,
): CreatorFitScore {
  const evidence = input.evidence;
  const weights = settings.scoreWeights;
  const categoryQualified = evidence.categoryFit === true
    && settings.allowedCategories.includes(input.identity.category);
  const categoryRelevance = categoryQualified
    ? weights.categoryRelevance
    : evidence.categoryFit === null
      ? portion(weights.categoryRelevance, 0.4)
      : 0;

  const koreanMarketQualified = evidence.recruitmentSuitability === true
    || evidence.recruitmentEvidence.koreanLanguageActivity.state === "likely";
  const koreanMarketActivity = koreanMarketQualified
    ? weights.koreanMarketActivity
    : evidence.recruitmentEvidence.koreanLanguageActivity.state === "unclear"
      ? portion(weights.koreanMarketActivity, 0.5)
      : 0;

  const ageDays = evidence.latestUploadDate && evidence.latestUploadConfirmed === true
    ? Math.max(0, Math.floor((now.getTime() - new Date(evidence.latestUploadDate).getTime()) / 86_400_000))
    : null;
  const recencyScore = ageDays === null
    ? 0
    : ageDays <= Math.min(settings.preferredRecentUploadDays, settings.maximumDaysSinceLatestUpload)
      ? portion(weights.activityConsistency, 0.4)
      : ageDays <= settings.maximumDaysSinceLatestUpload
        ? portion(weights.activityConsistency, 0.3)
        : 0;
  const volumeScore = evidence.recentVideoCount === null
    ? 0
    : evidence.recentVideoCount >= settings.preferredRecentVideoCount
      ? portion(weights.activityConsistency, 0.4)
      : evidence.recentVideoCount >= settings.minimumRecentVideoCount
        ? portion(weights.activityConsistency, 0.25)
        : 0;
  const consistencyScore = evidence.uploadConsistency === true
    ? portion(weights.activityConsistency, 0.2)
    : evidence.uploadConsistency === null
      ? portion(weights.activityConsistency, 0.1)
      : 0;
  const activityConsistency = clampScore(
    recencyScore + volumeScore + consistencyScore,
    weights.activityConsistency,
  );
  const activityQualified = ageDays !== null
    && ageDays <= settings.maximumDaysSinceLatestUpload
    && evidence.recentVideoCount !== null
    && evidence.recentVideoCount >= settings.minimumRecentVideoCount;

  const traffic = evaluateRecentTraffic(evidence, settings);
  let reachEfficiency = reachScore(traffic, weights.reachEfficiency);
  const subscriberInTargetRange = evidence.subscriberCount !== null
    && evidence.subscriberCount >= settings.minimumSubscriberCount
    && evidence.subscriberCount <= settings.maximumSubscriberCount;
  if (evidence.subscriberCount !== null && !subscriberInTargetRange) {
    reachEfficiency = portion(reachEfficiency, 0.75);
  }

  const authenticityRisk = clampScore(
    weights.authenticityRisk - (traffic.viralDistortion ? settings.viralRiskPenalty : 0),
    weights.authenticityRisk,
  );
  const contactReady = evidence.emailClassification === "personal"
    && evidence.emailVerificationState === "confirmed"
    && Boolean(evidence.visibleEmail?.trim());
  const contactability = contactReady
    ? weights.contactability
    : evidence.emailClassification === "personal"
      ? portion(weights.contactability, 0.4)
      : 0;
  const scoreComponents: FitScoreComponents = {
    categoryRelevance,
    koreanMarketActivity,
    activityConsistency,
    reachEfficiency,
    authenticityRisk,
    contactability,
  };
  const fitScore = clampScore(
    Object.values(scoreComponents).reduce((sum, value) => sum + value, 0),
    100,
  );

  return {
    fitScore,
    scoreComponents,
    contactReady,
    categoryQualified,
    koreanMarketQualified,
    activityQualified,
    reachQualified: traffic.reachQualified,
    subscriberInTargetRange,
    traffic,
  };
}

function reachScore(traffic: TrafficEvaluation, maximum: number): number {
  if (!traffic.complete) return 0;
  const median = traffic.median ?? 0;
  const representativeAverage = traffic.representativeAverage ?? 0;
  if (median >= 10_000 || representativeAverage >= 10_000) return maximum;
  if (median >= 5_000 || representativeAverage >= 7_500) return portion(maximum, 0.8);
  if (traffic.efficientSmallCreator) return portion(maximum, 0.5);
  if (traffic.reachQualified) return portion(maximum, 0.6);
  if (median >= 1_000 || representativeAverage >= 3_000) return portion(maximum, 0.25);
  return 0;
}

function portion(maximum: number, ratio: number): number {
  return Math.round(maximum * ratio);
}

function clampScore(value: number, maximum: number): number {
  return Math.max(0, Math.min(maximum, Math.round(value)));
}
