import { describe, expect, it } from "vitest";
import { defaultRecommendationSettings } from "@/config/recommendation-rules";
import { mockCreatorInputs } from "@/data/creators";
import {
  ApprovedPublicRecruitmentEvidenceProvider,
  type ApprovedPublicEvidenceClient,
} from "@/server/providers/recruitment/approved-public-provider";
import type {
  ApprovedSourceDescriptor,
  RawRecruitmentEvidenceItem,
  RawRecruitmentEvidenceResponse,
} from "@/server/providers/recruitment/provider-types";
import { applyRecruitmentEvidence } from "@/server/providers/recruitment/verification-evidence";
import { evaluateCreator } from "@/server/rules/evaluate-creator";
import type { AffiliationType, EmailClassification } from "@/types/domain";

const CHECKED_AT = "2026-07-22T06:00:00.000Z";
const REQUEST = {
  channelId: `UC${"h".repeat(22)}`,
  channelName: "H5 허구 채널",
  canonicalChannelUrl: `https://www.youtube.com/channel/UC${"h".repeat(22)}`,
};
const SOURCE: ApprovedSourceDescriptor = {
  sourceId: "fictional-approved-about",
  sourceType: "youtube_channel_about",
  publicUrl: "https://www.youtube.com/@h5-fictional/about",
};

describe("approved public recruitment evidence provider", () => {
  it("normalizes only explicit public evidence while keeping the raw response separate", async () => {
    const raw = response([
      contact("personal", "h5-creator@example.invalid"),
      affiliation("independent", null),
      suitability(true, true, false),
    ]);
    const result = await provider(raw).collectEvidence(REQUEST);

    expect(result.raw).toBe(raw);
    expect(result.normalized.contacts[0]).toEqual({
      email: "h5-creator@example.invalid",
      classification: "personal",
      verificationState: "confirmed",
      verifiedAt: CHECKED_AT,
      source: { ...SOURCE, approved: true },
    });
    expect(result.normalized.contactVerificationState).toBe("confirmed");
    expect(result.normalized).not.toHaveProperty("internalResponseBody");
    expect(result.normalized.koreanSuitability).toMatchObject({
      koreanAudienceSuitable: true,
      domesticActivitySuitable: true,
      foreignAudienceRisk: false,
      verificationState: "confirmed",
    });
  });

  it.each([
    ["personal", "h5-personal@example.invalid"],
    ["company", "h5-company@example.invalid"],
    ["agency", "h5-agency@example.invalid"],
    ["management", "h5-management@example.invalid"],
    ["mcn", "h5-mcn@example.invalid"],
    ["label", "h5-label@example.invalid"],
  ] as const)("preserves confirmed %s contact ownership", async (classification, email) => {
    const normalized = (await provider(response([contact(classification, email)])).collectEvidence(REQUEST)).normalized;
    expect(normalized.contacts[0]).toMatchObject({ email, classification, verificationState: "confirmed" });
  });

  it.each(["company", "agency", "management", "mcn", "label"] as const)(
    "preserves confirmed %s affiliation evidence",
    async (affiliationType) => {
      const normalized = (await provider(response([affiliation(affiliationType, `H5 허구 ${affiliationType}`)]))
        .collectEvidence(REQUEST)).normalized;
      expect(normalized.affiliations[0]).toMatchObject({
        affiliationType,
        organizationName: `H5 허구 ${affiliationType}`,
        verificationState: "confirmed",
        source: { sourceId: SOURCE.sourceId },
      });
    },
  );

  it("keeps missing and unconfirmed values unavailable instead of inferring them", async () => {
    const unconfirmed = { ...contact("personal", "must-not-surface@example.invalid"), verificationState: "unconfirmed" as const };
    const normalized = (await provider(response([unconfirmed])).collectEvidence(REQUEST)).normalized;
    const merged = applyRecruitmentEvidence(mockCreatorInputs[0].evidence, normalized);

    expect(normalized.contacts[0]).toMatchObject({ email: null, classification: "unknown", verificationState: "unconfirmed" });
    expect(merged).toMatchObject({ visibleEmail: null, emailClassification: "unknown", emailVerificationState: "not_checked" });
  });

  it("does not promote conflicting Korean suitability evidence to a confirmed value", async () => {
    const secondSource = { ...SOURCE, sourceId: "fictional-approved-profile", sourceType: "creator_public_profile" as const };
    const normalized = (await provider(response([
      suitability(true, true, false),
      { ...suitability(false, true, true), source: secondSource },
    ])).collectEvidence(REQUEST)).normalized;

    expect(normalized.koreanSuitability).toMatchObject({
      koreanAudienceSuitable: null,
      domesticActivitySuitable: true,
      foreignAudienceRisk: null,
      verificationState: "conflicting",
    });
    expect(normalized.koreanSuitability.sources).toHaveLength(2);
    expect(normalized.koreanSuitability.observations).toEqual([
      expect.objectContaining({ koreanAudienceSuitable: true, verifiedAt: CHECKED_AT, source: expect.objectContaining({ sourceId: SOURCE.sourceId }) }),
      expect.objectContaining({ koreanAudienceSuitable: false, verifiedAt: CHECKED_AT, source: expect.objectContaining({ sourceId: secondSource.sourceId }) }),
    ]);
    expect(applyRecruitmentEvidence(mockCreatorInputs[0].evidence, normalized)).toMatchObject({
      koreanAudienceSuitable: null,
      foreignAudienceRisk: null,
      recruitmentSuitability: null,
    });
  });

  it("marks conflicting contact and affiliation observations explicitly", async () => {
    const secondSource = { ...SOURCE, sourceId: "fictional-approved-website", sourceType: "creator_official_website" as const };
    const normalized = (await provider(response([
      contact("personal", "h5-personal@example.invalid"),
      { ...contact("agency", "h5-agency@example.invalid"), source: secondSource },
      affiliation("independent", null),
      { ...affiliation("agency", "H5 허구 에이전시"), source: secondSource },
    ])).collectEvidence(REQUEST)).normalized;

    expect(normalized.contactVerificationState).toBe("conflicting");
    expect(normalized.affiliationVerificationState).toBe("conflicting");
    expect(normalized.contacts).toHaveLength(2);
    expect(normalized.affiliations).toHaveLength(2);
  });

  it("rejects evidence from a source that was not explicitly approved", async () => {
    const unapproved = contact("personal", "blocked@example.invalid");
    await expect(provider(response([unapproved]), []).collectEvidence(REQUEST)).rejects.toThrow("승인되지 않은 출처");
  });
});

describe("recruitment evidence decision mapping", () => {
  it("uses likely Korean-language activity as domestic activity without inventing audience geography", async () => {
    const recruitment = (await provider(response([])).collectEvidence(REQUEST)).normalized;
    recruitment.koreanLanguageActivity = {
      ...recruitment.koreanLanguageActivity,
      recentTitleHangulPresenceRatio: 0.8,
      hangulCharacterRatio: 0.5,
      state: "likely",
    };
    const evidence = applyRecruitmentEvidence(mockCreatorInputs[0].evidence, recruitment);
    expect(evidence).toMatchObject({
      recruitmentSuitability: true,
      koreanAudienceSuitable: null,
      foreignAudienceRisk: null,
    });
  });

  it.each([
    ["company", "company_email"],
    ["agency", "agency_email"],
    ["management", "management_email"],
    ["mcn", "mcn_email"],
    ["label", "label_email"],
  ] as const)("keeps the existing hard gate for confirmed %s contact", async (classification, reason) => {
    const recruitment = (await provider(response([contact(classification, `${classification}@example.invalid`)]))
      .collectEvidence(REQUEST)).normalized;
    const input = { ...mockCreatorInputs[0], evidence: applyRecruitmentEvidence(mockCreatorInputs[0].evidence, recruitment) };
    const result = evaluateCreator(input, defaultRecommendationSettings, [], [], new Date(CHECKED_AT));

    expect(result.decision).toBe("excluded");
    expect(result.reasonCodes).toContain(reason);
    expect(input.evidence.recruitmentEvidence.contacts[0].source).toMatchObject({ approved: true });
  });

  it("maps confirmed organization affiliation to the existing affiliation hard gate", async () => {
    const recruitment = (await provider(response([affiliation("management", "H5 허구 매니지먼트")]))
      .collectEvidence(REQUEST)).normalized;
    const input = { ...mockCreatorInputs[0], evidence: applyRecruitmentEvidence(mockCreatorInputs[0].evidence, recruitment) };
    const result = evaluateCreator(input, defaultRecommendationSettings, [], [], new Date(CHECKED_AT));
    expect(result.decision).toBe("excluded");
    expect(result.reasonCodes).toContain("management_affiliation");
  });
});

function provider(
  raw: RawRecruitmentEvidenceResponse,
  approvedSourceIds = [...new Set(raw.items.map((item) => item.source.sourceId))],
): ApprovedPublicRecruitmentEvidenceProvider {
  const client: ApprovedPublicEvidenceClient = { fetchEvidence: async () => raw };
  return new ApprovedPublicRecruitmentEvidenceProvider(client, approvedSourceIds);
}

function response(items: RawRecruitmentEvidenceItem[]): RawRecruitmentEvidenceResponse {
  return { items };
}

function contact(classification: EmailClassification, email: string | null): RawRecruitmentEvidenceItem {
  return { kind: "contact", source: SOURCE, checkedAt: CHECKED_AT, verificationState: "confirmed", email, declaredOwnerType: classification };
}

function affiliation(affiliationType: AffiliationType, organizationName: string | null): RawRecruitmentEvidenceItem {
  return { kind: "affiliation", source: SOURCE, checkedAt: CHECKED_AT, verificationState: "confirmed", affiliationType, organizationName };
}

function suitability(
  koreanAudienceSuitable: boolean | null,
  domesticActivitySuitable: boolean | null,
  foreignAudienceRisk: boolean | null,
): RawRecruitmentEvidenceItem {
  return { kind: "korean_suitability", source: SOURCE, checkedAt: CHECKED_AT, verificationState: "confirmed", koreanAudienceSuitable, domesticActivitySuitable, foreignAudienceRisk };
}
