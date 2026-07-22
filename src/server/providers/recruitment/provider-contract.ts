import type {
  RecruitmentEvidenceRequest,
  RecruitmentEvidenceResult,
} from "@/server/providers/recruitment/provider-types";

export interface RecruitmentEvidenceProvider {
  collectEvidence(request: RecruitmentEvidenceRequest): Promise<RecruitmentEvidenceResult>;
}
