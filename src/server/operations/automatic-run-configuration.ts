import { z } from "zod";
import {
  defaultRecommendationSettings,
  maximumDaysSinceLatestUploadRange,
} from "@/config/recommendation-rules";
import { isApprovedCategory, isSafeDiscoveryQuery } from "@/server/discovery/discovery-taxonomy";
import type { AutomaticRunConfiguration } from "@/server/operations/operation-types";

export const automaticRunConfigurationSchema = z.object({
  name: z.string().trim().max(100).default(""),
  discoveryMode: z.enum(["automatic", "manual_replace", "manual_extend"]).default("automatic"),
  category: z.string().trim().default(""),
  keywords: z.string().trim().default(""),
  targetRecommendedCount: z.number().int().min(1).max(500),
  maximumDaysSinceLatestUpload: z.number().int()
    .min(maximumDaysSinceLatestUploadRange.minimum)
    .max(maximumDaysSinceLatestUploadRange.maximum)
    .default(defaultRecommendationSettings.maximumDaysSinceLatestUpload),
  preferredRecentUploadDays: z.number().int().min(7).max(90).default(defaultRecommendationSettings.preferredRecentUploadDays),
  minimumRecentAverageViews: z.number().nonnegative().default(defaultRecommendationSettings.minimumRecentAverageViews),
  minimumRecentMedianViews: z.number().nonnegative().default(defaultRecommendationSettings.minimumRecentMedianViews),
  minimumEfficientCreatorMedianViews: z.number().nonnegative().default(defaultRecommendationSettings.minimumEfficientCreatorMedianViews),
  minimumViewSubscriberRatio: z.number().min(0).max(10).default(defaultRecommendationSettings.minimumViewSubscriberRatio),
  minimumRecentVideoCount: z.number().int().min(1).default(defaultRecommendationSettings.minimumRecentVideoCount),
  preferredRecentVideoCount: z.number().int().min(2).default(defaultRecommendationSettings.preferredRecentVideoCount),
  minimumSubscriberCount: z.number().int().nonnegative().default(defaultRecommendationSettings.minimumSubscriberCount),
  maximumSubscriberCount: z.number().int().positive().default(defaultRecommendationSettings.maximumSubscriberCount),
  recommendationScoreThreshold: z.number().min(1).max(100).default(defaultRecommendationSettings.recommendationScoreThreshold),
  holdScoreThreshold: z.number().min(0).max(99).default(defaultRecommendationSettings.holdScoreThreshold),
  viralRiskPenalty: z.number().min(0).max(10).default(defaultRecommendationSettings.viralRiskPenalty),
  dynamicExclusionTtlDays: z.number().int().min(30).max(60).default(defaultRecommendationSettings.dynamicExclusionTtlDays),
  holdRecheckDays: z.number().int().min(14).max(30).default(defaultRecommendationSettings.holdRecheckDays),
  scoreWeights: z.object({
    categoryRelevance: z.number().nonnegative(),
    koreanMarketActivity: z.number().nonnegative(),
    activityConsistency: z.number().nonnegative(),
    reachEfficiency: z.number().nonnegative(),
    authenticityRisk: z.number().nonnegative(),
    contactability: z.number().nonnegative(),
  }).default(defaultRecommendationSettings.scoreWeights),
  allowedCategories: z.array(z.string()).min(1).default(defaultRecommendationSettings.allowedCategories),
}).superRefine((input, context) => {
  if (input.discoveryMode !== "automatic" && !input.keywords) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["keywords"], message: "추가 검색어 모드에는 검색어가 필요합니다." });
  }
  if (input.keywords && input.keywords.split(/[\n,]/).some((keyword) => keyword.trim() && !isSafeDiscoveryQuery(keyword))) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["keywords"], message: "검색어에 허용되지 않는 값이 포함되어 있습니다." });
  }
  if (input.category && !isApprovedCategory(input.category)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["category"], message: "승인되지 않은 카테고리입니다." });
  }
  if (input.allowedCategories.some((category) => !isApprovedCategory(category))) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["allowedCategories"], message: "허용되지 않은 카테고리가 포함되어 있습니다." });
  }
  if (input.minimumSubscriberCount > input.maximumSubscriberCount) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["minimumSubscriberCount"], message: "최소 구독자 수는 최대 구독자 수 이하여야 합니다." });
  }
  if (input.holdScoreThreshold >= input.recommendationScoreThreshold) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["holdScoreThreshold"], message: "보류 점수는 추천 점수보다 낮아야 합니다." });
  }
  if (input.preferredRecentVideoCount < input.minimumRecentVideoCount) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["preferredRecentVideoCount"], message: "선호 영상 수는 최소 영상 수 이상이어야 합니다." });
  }
  const totalWeight = Object.values(input.scoreWeights).reduce((sum, weight) => sum + weight, 0);
  if (Math.abs(totalWeight - 100) > Number.EPSILON) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["scoreWeights"], message: "적합도 배점 합계는 100이어야 합니다." });
  }
});

export function parseAutomaticRunConfiguration(value: unknown): AutomaticRunConfiguration | null {
  const result = automaticRunConfigurationSchema.safeParse(value);
  return result.success ? result.data : null;
}
