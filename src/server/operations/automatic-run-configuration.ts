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
  minimumRecentAverageViews: z.number().nonnegative().default(defaultRecommendationSettings.minimumRecentAverageViews),
  minimumRecentVideoCount: z.number().int().min(2).default(defaultRecommendationSettings.minimumRecentVideoCount),
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
});

export function parseAutomaticRunConfiguration(value: unknown): AutomaticRunConfiguration | null {
  const result = automaticRunConfigurationSchema.safeParse(value);
  return result.success ? result.data : null;
}
