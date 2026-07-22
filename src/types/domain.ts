export type CreatorDecision = "recommended" | "hold" | "excluded";
export type HistoryStatus = "recommended" | "candidate" | "excluded";
export type RunStatus = "running" | "reviewing" | "completed";
export type VerificationState = "confirmed" | "unconfirmed" | "not_checked";
export type EmailClassification = "personal" | "company" | "agency" | "management" | "mcn" | "label" | "unknown" | "not_found" | "not_checked";
export type ContentType = "long_form" | "shorts" | "mixed" | "unknown";
export type RecruitmentVerificationState = VerificationState | "not_found" | "conflicting";
export type OrganizationType = "company" | "agency" | "management" | "mcn" | "label";
export type AffiliationType = OrganizationType | "independent" | "unknown";

export interface RecruitmentEvidenceSource {
  sourceId: string;
  sourceType: "youtube_channel_about" | "creator_official_website" | "creator_public_profile";
  publicUrl: string;
  approved: true;
}

export interface PublicContactEvidence {
  email: string | null;
  classification: EmailClassification;
  verificationState: RecruitmentVerificationState;
  verifiedAt: string;
  source: RecruitmentEvidenceSource;
}

export interface AffiliationEvidence {
  affiliationType: AffiliationType;
  organizationName: string | null;
  verificationState: RecruitmentVerificationState;
  verifiedAt: string;
  source: RecruitmentEvidenceSource;
}

export interface KoreanSuitabilityObservation {
  koreanAudienceSuitable: boolean | null;
  domesticActivitySuitable: boolean | null;
  foreignAudienceRisk: boolean | null;
  verificationState: RecruitmentVerificationState;
  verifiedAt: string;
  source: RecruitmentEvidenceSource;
}

export interface KoreanSuitabilityEvidence {
  koreanAudienceSuitable: boolean | null;
  domesticActivitySuitable: boolean | null;
  foreignAudienceRisk: boolean | null;
  verificationState: RecruitmentVerificationState;
  verifiedAt: string;
  sources: RecruitmentEvidenceSource[];
  observations: KoreanSuitabilityObservation[];
}

export interface RecruitmentEvidence {
  contacts: PublicContactEvidence[];
  contactVerificationState: RecruitmentVerificationState;
  affiliations: AffiliationEvidence[];
  affiliationVerificationState: RecruitmentVerificationState;
  koreanSuitability: KoreanSuitabilityEvidence;
}

export interface CreatorIdentity {
  internalId: string;
  channelName: string;
  normalizedChannelName: string;
  confirmedAliases: string[];
  canonicalChannelUrl: string | null;
  youtubeChannelId: string | null;
  youtubeHandle: string | null;
  sourceUrls: string[];
  category: string;
  identityVerificationState: VerificationState;
}

export interface VerificationEvidence {
  channelExists: boolean | null;
  channelNameMatches: boolean | null;
  confirmedChannelUrl: string | null;
  videosExist: boolean | null;
  latestUploadDate: string | null;
  latestUploadConfirmed: boolean | null;
  recentVideoCount: number | null;
  recentVideoUrls: string[];
  recentViewCounts: number[] | null;
  recentAverageViews: number | null;
  subscriberCount: number | null;
  uploadConsistency: boolean | null;
  contentType: ContentType;
  categoryFit: boolean | null;
  koreanAudienceSuitable: boolean | null;
  foreignAudienceRisk: boolean | null;
  overseasBaseRisk: boolean | null;
  celebrityRisk: boolean | null;
  officialChannelRisk: boolean | null;
  companyChannelRisk: boolean | null;
  brandChannelRisk: boolean | null;
  corporateChannelRisk: boolean | null;
  agencyRisk: boolean | null;
  managementRisk: boolean | null;
  mcnRisk: boolean | null;
  labelRisk: boolean | null;
  reuploadRisk: boolean | null;
  compilationRisk: boolean | null;
  contentFarmRisk: boolean | null;
  viralVideoDistortionRisk: boolean | null;
  visibleEmail: string | null;
  emailVerificationState: VerificationState;
  emailClassification: EmailClassification;
  recruitmentSuitability: boolean | null;
  recruitmentEvidence: RecruitmentEvidence;
  evidenceSource: string;
  verifiedAt: string;
}

export type ManualCorrectionCode =
  | "already_processed" | "no_videos" | "inactive" | "channel_not_found"
  | "too_large" | "celebrity_or_official" | "company_channel"
  | "agency_affiliation" | "management_affiliation" | "mcn_affiliation"
  | "insufficient_traffic" | "incorrect_category" | "other_invalid";

export interface ManualCorrection {
  code: ManualCorrectionCode;
  note: string;
  correctedAt: string;
}

export interface CreatorInput {
  identity: CreatorIdentity;
  evidence: VerificationEvidence;
  mockScenario: string;
  manualCorrection?: ManualCorrection | null;
}

export interface IdentityMatch {
  matched: boolean;
  recordId?: string;
  matchedBy?: "channel_id" | "canonical_url" | "handle" | "alias" | "normalized_name";
}

export interface EvaluationResult {
  decision: CreatorDecision;
  reasonCodes: ReasonCode[];
  koreanExplanation: string;
  passedChecks: string[];
  failedChecks: string[];
  warningChecks: string[];
  missingVerificationFields: string[];
  historyMatch: IdentityMatch | null;
  sameRunMatch: IdentityMatch | null;
  manualCorrection: ManualCorrection | null;
  evaluatedAt: string;
}

export type EvaluatedCreator = Omit<CreatorInput, "manualCorrection"> & EvaluationResult;

export type ReasonCode =
  | "prior_history_duplicate" | "same_run_duplicate" | "user_corrected_invalid"
  | "channel_not_found" | "channel_url_unconfirmed" | "channel_name_mismatch" | "identity_unclear"
  | "no_videos" | "latest_upload_too_old" | "insufficient_recent_activity" | "insufficient_recent_video_count"
  | "recent_views_below_threshold" | "viral_video_distortion" | "category_mismatch"
  | "foreign_audience_heavy" | "overseas_based" | "celebrity_channel" | "official_channel"
  | "company_channel" | "corporate_channel" | "brand_channel" | "agency_affiliation"
  | "management_affiliation" | "mcn_affiliation" | "label_affiliation" | "company_email"
  | "agency_email" | "management_email" | "mcn_email" | "label_email" | "missing_email"
  | "email_not_checked" | "email_ownership_unknown" | "missing_verification"
  | "subscriber_threshold_not_configured" | "reupload_channel" | "compilation_channel" | "too_large";

export interface RecommendationSettings {
  maximumDaysSinceLatestUpload: number;
  minimumRecentVideoCount: number;
  preferredRecentVideoCount: number;
  minimumRecentAverageViews: number;
  defaultRecentAverageWindow: number;
  extendedRecentAverageWindow: number;
  allowedCategories: string[];
  blockedChannelTypes: string[];
  excludedEmailClassifications: EmailClassification[];
  minimumSubscriberCount?: number;
  maximumSubscriberCount?: number;
}

export interface HistoryRecord {
  id: string;
  identity: CreatorIdentity;
  historyStatus: HistoryStatus;
  finalDecision: CreatorDecision;
  category: string;
  reasonCodes: ReasonCode[];
  koreanExplanation: string;
  evidenceSummary: string;
  scoutingRunId: string;
  createdAt: string;
  updatedAt: string;
  manualCorrection: ManualCorrection | null;
}

export interface ScoutingRun {
  id: string; name: string; category: string; createdAt: string;
  totalDiscovered: number; candidateCount: number; approvedCount: number; excludedCount: number; status: RunStatus;
}

export interface HistoryExportRecord { channel_name: string; url: string; status: HistoryStatus; }
export interface NewRunInput { name: string; category: string; keywords: string; targetCount: number; maximumDaysSinceLatestUpload: number; minimumRecentAverageViews: number; minimumRecentVideoCount: number; }
