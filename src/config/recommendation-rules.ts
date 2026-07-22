import { z } from "zod";
import type { RecommendationSettings } from "@/types/domain";
import type { EmailClassification, ReasonCode } from "@/types/domain";

export const recommendationSettingsSchema = z.object({
  maximumDaysSinceLatestUpload: z.number().int().min(42).max(56),
  minimumRecentVideoCount: z.number().int().min(2),
  preferredRecentVideoCount: z.number().int().min(3),
  minimumRecentAverageViews: z.number().min(0),
  defaultRecentAverageWindow: z.literal(5),
  extendedRecentAverageWindow: z.number().int().min(5).max(10),
  allowedCategories: z.array(z.string()).min(1),
  blockedChannelTypes: z.array(z.string()),
  excludedEmailClassifications: z.array(z.enum(["company", "agency", "management", "mcn", "label"])),
  minimumSubscriberCount: z.number().nonnegative().optional(),
  maximumSubscriberCount: z.number().positive().optional(),
});

export const defaultRecommendationSettings: RecommendationSettings = recommendationSettingsSchema.parse({
  maximumDaysSinceLatestUpload: 56,
  minimumRecentVideoCount: 2,
  preferredRecentVideoCount: 3,
  minimumRecentAverageViews: 10000,
  defaultRecentAverageWindow: 5,
  extendedRecentAverageWindow: 10,
  allowedCategories: ["뷰티", "푸드", "테크", "라이프스타일", "여행"],
  blockedChannelTypes: ["official", "company", "corporate", "brand", "agency", "management", "mcn", "label", "reupload", "compilation"],
  excludedEmailClassifications: ["company", "agency", "management", "mcn", "label"],
});

export const duplicateMatchingRules = ["channel_id", "canonical_url", "handle", "confirmed_alias", "normalized_exact_name"] as const;
export const emailClassificationRules: Record<EmailClassification, "recommendation_eligible" | "hold" | "excluded"> = { personal: "recommendation_eligible", unknown: "hold", not_found: "hold", not_checked: "hold", company: "excluded", agency: "excluded", management: "excluded", mcn: "excluded", label: "excluded" };
export const exclusionReasonMappings: Partial<Record<ReasonCode, "hard_exclusion">> = {
  prior_history_duplicate: "hard_exclusion", same_run_duplicate: "hard_exclusion", user_corrected_invalid: "hard_exclusion", channel_not_found: "hard_exclusion", channel_url_unconfirmed: "hard_exclusion", channel_name_mismatch: "hard_exclusion", identity_unclear: "hard_exclusion", no_videos: "hard_exclusion", latest_upload_too_old: "hard_exclusion", insufficient_recent_video_count: "hard_exclusion", recent_views_below_threshold: "hard_exclusion", viral_video_distortion: "hard_exclusion", category_mismatch: "hard_exclusion", foreign_audience_heavy: "hard_exclusion", overseas_based: "hard_exclusion", celebrity_channel: "hard_exclusion", official_channel: "hard_exclusion", company_channel: "hard_exclusion", corporate_channel: "hard_exclusion", brand_channel: "hard_exclusion", agency_affiliation: "hard_exclusion", management_affiliation: "hard_exclusion", mcn_affiliation: "hard_exclusion", label_affiliation: "hard_exclusion", company_email: "hard_exclusion", agency_email: "hard_exclusion", management_email: "hard_exclusion", mcn_email: "hard_exclusion", label_email: "hard_exclusion", reupload_channel: "hard_exclusion", compilation_channel: "hard_exclusion", too_large: "hard_exclusion",
};
