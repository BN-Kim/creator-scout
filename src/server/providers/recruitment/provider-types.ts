import type {
  AffiliationType,
  EmailClassification,
  RecruitmentEvidence,
  RecruitmentEvidenceSource,
  RecruitmentVerificationState,
} from "@/types/domain";

export interface RecruitmentEvidenceRequest {
  channelId: string;
  channelName: string;
  canonicalChannelUrl: string;
}

export interface ApprovedSourceDescriptor {
  sourceId: string;
  sourceType: RecruitmentEvidenceSource["sourceType"];
  publicUrl: string;
}

interface RawEvidenceBase {
  source: ApprovedSourceDescriptor;
  checkedAt: string;
  verificationState: RecruitmentVerificationState;
}

export interface RawPublicContactEvidence extends RawEvidenceBase {
  kind: "contact";
  email: string | null;
  declaredOwnerType: EmailClassification;
}

export interface RawAffiliationEvidence extends RawEvidenceBase {
  kind: "affiliation";
  affiliationType: AffiliationType;
  organizationName: string | null;
}

export interface RawKoreanSuitabilityEvidence extends RawEvidenceBase {
  kind: "korean_suitability";
  koreanAudienceSuitable: boolean | null;
  domesticActivitySuitable: boolean | null;
  foreignAudienceRisk: boolean | null;
}

export type RawRecruitmentEvidenceItem =
  | RawPublicContactEvidence
  | RawAffiliationEvidence
  | RawKoreanSuitabilityEvidence;

export interface RawRecruitmentEvidenceResponse {
  items: RawRecruitmentEvidenceItem[];
}

export interface RecruitmentEvidenceResult<TRaw = unknown> {
  normalized: RecruitmentEvidence;
  raw: TRaw;
}
