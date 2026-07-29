import type { RecruitmentEvidenceProvider } from "@/server/providers/recruitment/provider-contract";
import type {
  RawKoreanSuitabilityEvidence,
  RawRecruitmentEvidenceItem,
  RawRecruitmentEvidenceResponse,
  RecruitmentEvidenceRequest,
  RecruitmentEvidenceResult,
} from "@/server/providers/recruitment/provider-types";
import type {
  AffiliationEvidence,
  KoreanSuitabilityEvidence,
  KoreanSuitabilityObservation,
  PublicContactEvidence,
  RecruitmentEvidence,
  RecruitmentEvidenceSource,
} from "@/types/domain";

export interface ApprovedPublicEvidenceClient {
  fetchEvidence(request: RecruitmentEvidenceRequest): Promise<RawRecruitmentEvidenceResponse>;
}

export class ApprovedPublicRecruitmentEvidenceProvider implements RecruitmentEvidenceProvider {
  private readonly approvedSourceIds: ReadonlySet<string>;

  constructor(private readonly client: ApprovedPublicEvidenceClient, approvedSourceIds: readonly string[]) {
    this.approvedSourceIds = new Set(approvedSourceIds);
  }

  async collectEvidence(request: RecruitmentEvidenceRequest): Promise<RecruitmentEvidenceResult<RawRecruitmentEvidenceResponse>> {
    validateRequest(request);
    const raw = await this.client.fetchEvidence(request);
    if (!raw || !Array.isArray(raw.items)) throw new Error("승인 출처 응답 형식이 올바르지 않습니다.");
    return { normalized: normalizeApprovedRecruitmentEvidence(raw.items, this.approvedSourceIds), raw };
  }
}

export function createUncheckedRecruitmentEvidence(): RecruitmentEvidence {
  return {
    contacts: [],
    contactVerificationState: "not_checked",
    affiliations: [],
    affiliationVerificationState: "not_checked",
    koreanSuitability: {
      koreanAudienceSuitable: null,
      domesticActivitySuitable: null,
      foreignAudienceRisk: null,
      verificationState: "not_checked",
      verifiedAt: new Date(0).toISOString(),
      sources: [],
      observations: [],
    },
    koreanLanguageActivity: {
      recentTitleHangulPresenceRatio: null,
      hangulCharacterRatio: null,
      explicitKoreanCountryOrActivityEvidence: null,
      countryMetadata: null,
      languageMetadata: null,
      state: "unclear",
      verifiedAt: new Date(0).toISOString(),
      sources: [],
    },
  };
}

function validateRequest(request: RecruitmentEvidenceRequest): void {
  if (!request.channelId.trim() || !request.channelName.trim() || !request.canonicalChannelUrl.trim()) {
    throw new Error("리크루팅 근거 조회에는 확인된 채널 신원이 필요합니다.");
  }
}

export function normalizeApprovedRecruitmentEvidence(
  items: RawRecruitmentEvidenceItem[],
  approvedSourceIds: ReadonlySet<string>,
): RecruitmentEvidence {
  if (items.some((item) => !approvedSourceIds.has(item.source.sourceId))) throw new Error("승인되지 않은 출처의 근거는 사용할 수 없습니다.");
  const approvedItems = items;
  const contacts = approvedItems.flatMap((item): PublicContactEvidence[] => {
    if (item.kind !== "contact") return [];
    return [{
      email: item.verificationState === "confirmed" ? item.email : null,
      classification: item.verificationState === "confirmed" ? item.declaredOwnerType : "unknown",
      verificationState: item.verificationState,
      verifiedAt: validTimestamp(item.checkedAt),
      source: normalizeSource(item.source),
    }];
  });
  const affiliations = approvedItems.flatMap((item): AffiliationEvidence[] => {
    if (item.kind !== "affiliation") return [];
    return [{
      affiliationType: item.verificationState === "confirmed" ? item.affiliationType : "unknown",
      organizationName: item.verificationState === "confirmed" ? item.organizationName : null,
      verificationState: item.verificationState,
      verifiedAt: validTimestamp(item.checkedAt),
      source: normalizeSource(item.source),
    }];
  });
  const suitabilityItems = approvedItems.filter(
    (item): item is RawKoreanSuitabilityEvidence => item.kind === "korean_suitability",
  );
  return {
    contacts,
    contactVerificationState: aggregateState(
      contacts.map((item) => item.verificationState),
      contacts.filter((item) => item.verificationState === "confirmed").map((item) => item.classification),
    ),
    affiliations,
    affiliationVerificationState: aggregateState(
      affiliations.map((item) => item.verificationState),
      affiliations.filter((item) => item.verificationState === "confirmed").map((item) => `${item.affiliationType}:${item.organizationName ?? "missing"}`),
    ),
    koreanSuitability: normalizeSuitability(suitabilityItems),
    koreanLanguageActivity: createUncheckedRecruitmentEvidence().koreanLanguageActivity,
  };
}

function aggregateState(
  states: RecruitmentEvidence["contactVerificationState"][],
  confirmedValues: string[],
): RecruitmentEvidence["contactVerificationState"] {
  if (states.length === 0) return "not_checked";
  if (new Set(confirmedValues).size > 1) return "conflicting";
  if (confirmedValues.length > 0) return "confirmed";
  if (states.includes("conflicting")) return "conflicting";
  if (states.includes("unconfirmed")) return "unconfirmed";
  if (states.includes("not_checked")) return "not_checked";
  if (states.includes("not_found")) return "not_found";
  return "not_checked";
}

function normalizeSuitability(items: RawKoreanSuitabilityEvidence[]): KoreanSuitabilityEvidence {
  if (items.length === 0) return createUncheckedRecruitmentEvidence().koreanSuitability;
  const observations = items.map((item): KoreanSuitabilityObservation => ({
    koreanAudienceSuitable: item.verificationState === "confirmed" ? item.koreanAudienceSuitable : null,
    domesticActivitySuitable: item.verificationState === "confirmed" ? item.domesticActivitySuitable : null,
    foreignAudienceRisk: item.verificationState === "confirmed" ? item.foreignAudienceRisk : null,
    verificationState: item.verificationState,
    verifiedAt: validTimestamp(item.checkedAt),
    source: normalizeSource(item.source),
  }));
  const confirmed = observations.filter((item) => item.verificationState === "confirmed");
  const verifiedAt = observations.map((item) => item.verifiedAt).sort().at(-1) ?? new Date(0).toISOString();
  const sources = uniqueSources(observations.map((item) => item.source));
  if (confirmed.length === 0) {
    return { koreanAudienceSuitable: null, domesticActivitySuitable: null, foreignAudienceRisk: null, verificationState: items[0].verificationState, verifiedAt, sources, observations };
  }
  const koreanAudienceSuitable = consensus(confirmed.map((item) => item.koreanAudienceSuitable));
  const domesticActivitySuitable = consensus(confirmed.map((item) => item.domesticActivitySuitable));
  const foreignAudienceRisk = consensus(confirmed.map((item) => item.foreignAudienceRisk));
  const conflicting = [koreanAudienceSuitable, domesticActivitySuitable, foreignAudienceRisk].some((value) => value === "conflicting");
  return {
    koreanAudienceSuitable: koreanAudienceSuitable === "conflicting" ? null : koreanAudienceSuitable,
    domesticActivitySuitable: domesticActivitySuitable === "conflicting" ? null : domesticActivitySuitable,
    foreignAudienceRisk: foreignAudienceRisk === "conflicting" ? null : foreignAudienceRisk,
    verificationState: conflicting ? "conflicting" : "confirmed",
    verifiedAt,
    sources,
    observations,
  };
}

function consensus(values: Array<boolean | null>): boolean | null | "conflicting" {
  const known = values.filter((value): value is boolean => value !== null);
  if (known.length === 0) return null;
  return new Set(known).size > 1 ? "conflicting" : known[0];
}

function normalizeSource(source: RawRecruitmentEvidenceItem["source"]): RecruitmentEvidenceSource {
  if (!source.sourceId.trim() || !source.publicUrl.trim()) throw new Error("승인 출처 식별자와 공개 URL이 필요합니다.");
  let url: URL;
  try {
    url = new URL(source.publicUrl);
  } catch {
    throw new Error("승인 출처 공개 URL이 올바르지 않습니다.");
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error("승인 출처는 공개 HTTP URL이어야 합니다.");
  return { sourceId: source.sourceId, sourceType: source.sourceType, publicUrl: source.publicUrl, approved: true };
}

function validTimestamp(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error("근거 확인 시각이 올바르지 않습니다.");
  return parsed.toISOString();
}

function uniqueSources(sources: RecruitmentEvidenceSource[]): RecruitmentEvidenceSource[] {
  return [...new Map(sources.map((source) => [source.sourceId, source])).values()];
}
