import { z } from "zod";
import type {
  EmailClassification,
  FitScoreWeights,
  ReasonCode,
  RecommendationSettings,
} from "@/types/domain";

export const recommendationRuleVersion = "2026-08-marketing-fit-v1";
export const legacyRecommendationRuleVersion = "legacy";
export const maximumDaysSinceLatestUploadRange = { minimum: 7, maximum: 90 } as const;

export const defaultFitScoreWeights: FitScoreWeights = {
  categoryRelevance: 25,
  koreanMarketActivity: 20,
  activityConsistency: 20,
  reachEfficiency: 20,
  authenticityRisk: 10,
  contactability: 5,
};

const scoreWeightsSchema = z.object({
  categoryRelevance: z.number().nonnegative(),
  koreanMarketActivity: z.number().nonnegative(),
  activityConsistency: z.number().nonnegative(),
  reachEfficiency: z.number().nonnegative(),
  authenticityRisk: z.number().nonnegative(),
  contactability: z.number().nonnegative(),
});

export const recommendationSettingsSchema = z.object({
  maximumDaysSinceLatestUpload: z.number().int()
    .min(maximumDaysSinceLatestUploadRange.minimum)
    .max(maximumDaysSinceLatestUploadRange.maximum),
  preferredRecentUploadDays: z.number().int().min(7).max(90).default(60),
  minimumRecentVideoCount: z.number().int().min(1),
  preferredRecentVideoCount: z.number().int().min(2).default(2),
  minimumRecentAverageViews: z.number().nonnegative(),
  minimumRecentMedianViews: z.number().nonnegative().default(3_000),
  minimumEfficientCreatorMedianViews: z.number().nonnegative().default(1_000),
  minimumViewSubscriberRatio: z.number().min(0).max(10).default(0.1),
  defaultRecentAverageWindow: z.literal(5),
  extendedRecentAverageWindow: z.number().int().min(5).max(10),
  recommendationScoreThreshold: z.number().min(1).max(100).default(70),
  holdScoreThreshold: z.number().min(0).max(99).default(50),
  viralRiskPenalty: z.number().min(0).max(10).default(5),
  dynamicExclusionTtlDays: z.number().int().min(30).max(60).default(45),
  holdRecheckDays: z.number().int().min(14).max(30).default(21),
  scoreWeights: scoreWeightsSchema.default(defaultFitScoreWeights),
  allowedCategories: z.array(z.string()).min(1),
  blockedChannelTypes: z.array(z.string()),
  excludedEmailClassifications: z.array(z.enum(["company", "agency", "management", "mcn", "label"])),
  minimumSubscriberCount: z.number().nonnegative().default(1_000),
  maximumSubscriberCount: z.number().positive().default(250_000),
}).superRefine((settings, context) => {
  const totalWeight = Object.values(settings.scoreWeights).reduce((sum, value) => sum + value, 0);
  if (Math.abs(totalWeight - 100) > Number.EPSILON) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["scoreWeights"], message: "적합도 배점 합계는 100이어야 합니다." });
  }
  if (settings.holdScoreThreshold >= settings.recommendationScoreThreshold) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["holdScoreThreshold"], message: "보류 점수는 추천 점수보다 낮아야 합니다." });
  }
  if (settings.preferredRecentVideoCount < settings.minimumRecentVideoCount) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["preferredRecentVideoCount"], message: "선호 영상 수는 최소 영상 수 이상이어야 합니다." });
  }
  if (settings.minimumSubscriberCount > settings.maximumSubscriberCount) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["minimumSubscriberCount"], message: "최소 구독자 수는 최대 구독자 수 이하여야 합니다." });
  }
});

export const defaultRecommendationSettings: RecommendationSettings = recommendationSettingsSchema.parse({
  maximumDaysSinceLatestUpload: 90,
  preferredRecentUploadDays: 60,
  minimumRecentVideoCount: 1,
  preferredRecentVideoCount: 2,
  minimumRecentAverageViews: 5_000,
  minimumRecentMedianViews: 3_000,
  minimumEfficientCreatorMedianViews: 1_000,
  minimumViewSubscriberRatio: 0.1,
  defaultRecentAverageWindow: 5,
  extendedRecentAverageWindow: 10,
  recommendationScoreThreshold: 70,
  holdScoreThreshold: 50,
  viralRiskPenalty: 5,
  dynamicExclusionTtlDays: 45,
  holdRecheckDays: 21,
  scoreWeights: defaultFitScoreWeights,
  allowedCategories: ["뷰티", "패션", "푸드", "테크", "라이프스타일", "여행"],
  blockedChannelTypes: ["official", "company", "corporate", "brand", "agency", "management", "mcn", "label", "reupload", "compilation"],
  excludedEmailClassifications: ["company", "agency", "management", "mcn", "label"],
  minimumSubscriberCount: 1_000,
  maximumSubscriberCount: 250_000,
});

export const duplicateMatchingRules = ["channel_id", "canonical_url", "handle", "confirmed_alias", "normalized_exact_name"] as const;
export const emailClassificationRules: Record<EmailClassification, "recommendation_eligible" | "hold" | "excluded"> = {
  personal: "recommendation_eligible",
  unknown: "hold",
  not_found: "hold",
  not_checked: "hold",
  company: "excluded",
  agency: "excluded",
  management: "excluded",
  mcn: "excluded",
  label: "excluded",
};

/** Confirmed, non-negotiable product disqualifiers. Time-varying performance signals are intentionally absent. */
export const exclusionReasonMappings: Partial<Record<ReasonCode, "hard_exclusion">> = {
  prior_history_duplicate: "hard_exclusion",
  same_run_duplicate: "hard_exclusion",
  user_corrected_invalid: "hard_exclusion",
  channel_not_found: "hard_exclusion",
  channel_url_unconfirmed: "hard_exclusion",
  channel_name_mismatch: "hard_exclusion",
  identity_unclear: "hard_exclusion",
  no_videos: "hard_exclusion",
  category_mismatch: "hard_exclusion",
  foreign_audience_heavy: "hard_exclusion",
  overseas_based: "hard_exclusion",
  celebrity_channel: "hard_exclusion",
  official_channel: "hard_exclusion",
  company_channel: "hard_exclusion",
  corporate_channel: "hard_exclusion",
  brand_channel: "hard_exclusion",
  agency_affiliation: "hard_exclusion",
  management_affiliation: "hard_exclusion",
  mcn_affiliation: "hard_exclusion",
  label_affiliation: "hard_exclusion",
  company_email: "hard_exclusion",
  agency_email: "hard_exclusion",
  management_email: "hard_exclusion",
  mcn_email: "hard_exclusion",
  label_email: "hard_exclusion",
  reupload_channel: "hard_exclusion",
  compilation_channel: "hard_exclusion",
};

export function isPermanentHardExclusionReason(reasonCode: ReasonCode): boolean {
  return exclusionReasonMappings[reasonCode] === "hard_exclusion";
}
