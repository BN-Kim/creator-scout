import { z } from "zod";

const verificationStateSchema = z.enum(["confirmed", "unconfirmed", "not_checked"]);
const creatorDecisionSchema = z.enum(["recommended", "hold", "excluded"]);
const historyStatusSchema = z.enum(["recommended", "candidate", "excluded"]);
const reasonCodeSchema = z.enum([
  "prior_history_duplicate", "same_run_duplicate", "user_corrected_invalid", "channel_not_found",
  "channel_url_unconfirmed", "channel_name_mismatch", "identity_unclear", "no_videos",
  "latest_upload_too_old", "insufficient_recent_activity", "insufficient_recent_video_count",
  "recent_views_below_threshold", "viral_video_distortion", "category_mismatch", "foreign_audience_heavy",
  "overseas_based", "celebrity_channel", "official_channel", "company_channel", "corporate_channel",
  "brand_channel", "agency_affiliation", "management_affiliation", "mcn_affiliation", "label_affiliation",
  "company_email", "agency_email", "management_email", "mcn_email", "label_email", "missing_email",
  "email_not_checked", "email_ownership_unknown", "affiliation_conflict", "missing_verification", "subscriber_threshold_not_configured",
  "reupload_channel", "compilation_channel", "too_large",
]);
const manualCorrectionCodeSchema = z.enum([
  "already_processed", "no_videos", "inactive", "channel_not_found", "too_large", "celebrity_or_official",
  "company_channel", "agency_affiliation", "management_affiliation", "mcn_affiliation", "insufficient_traffic",
  "incorrect_category", "other_invalid",
]);

export const historyRecordSchema = z.object({
  id: z.string().min(1),
  identity: z.object({
    internalId: z.string().min(1),
    channelName: z.string().min(1),
    normalizedChannelName: z.string().min(1),
    confirmedAliases: z.array(z.string()),
    canonicalChannelUrl: z.string().url().nullable(),
    youtubeChannelId: z.string().nullable(),
    youtubeHandle: z.string().nullable(),
    sourceUrls: z.array(z.string()),
    category: z.string().min(1),
    identityVerificationState: verificationStateSchema,
  }),
  historyStatus: historyStatusSchema,
  finalDecision: creatorDecisionSchema,
  category: z.string().min(1),
  reasonCodes: z.array(reasonCodeSchema),
  koreanExplanation: z.string(),
  evidenceSummary: z.string(),
  scoutingRunId: z.string().min(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  manualCorrection: z.object({
    code: manualCorrectionCodeSchema,
    note: z.string(),
    correctedAt: z.string().datetime(),
  }).nullable(),
});

export const historyRecordArraySchema = z.array(historyRecordSchema);
