import type { RecruitmentEvidence, VerificationEvidence } from "@/types/domain";

const organizationClassifications = ["company", "agency", "management", "mcn", "label"] as const;

export function applyRecruitmentEvidence(
  base: VerificationEvidence,
  recruitment: RecruitmentEvidence,
): VerificationEvidence {
  const confirmedContacts = recruitment.contacts.filter((contact) => contact.verificationState === "confirmed");
  const organizationContact = confirmedContacts.find((contact) => organizationClassifications.includes(
    contact.classification as typeof organizationClassifications[number],
  ));
  const personalContacts = confirmedContacts.filter((contact) => contact.classification === "personal" && contact.email);
  const uniquePersonalContacts = [...new Map(personalContacts.map((contact) => [
    contact.email?.toLowerCase(),
    contact,
  ])).values()];
  const hasContactConflict = !organizationContact && recruitment.contactVerificationState === "conflicting";
  const contact = organizationContact ?? (!hasContactConflict ? uniquePersonalContacts[0] ?? null : null);
  const organizationAffiliations = recruitment.affiliations.filter(
    (item) => item.verificationState === "confirmed" && organizationClassifications.includes(
      item.affiliationType as typeof organizationClassifications[number],
    ),
  );
  const suitability = recruitment.koreanSuitability;
  const domesticActivitySatisfied = (suitability.verificationState === "confirmed" && suitability.domesticActivitySuitable === true)
    || recruitment.koreanLanguageActivity.state === "likely";
  const domesticActivityRejected = suitability.verificationState === "confirmed" && suitability.domesticActivitySuitable === false
    && recruitment.koreanLanguageActivity.state === "unlikely";
  return {
    ...base,
    visibleEmail: hasContactConflict ? null : contact?.email ?? null,
    emailVerificationState: contact ? "confirmed" : confirmedContacts.length > 0 ? "unconfirmed" : "not_checked",
    emailClassification: hasContactConflict ? "unknown" : contact?.classification ?? evidenceMissingClassification(recruitment),
    agencyRisk: hasAffiliation(organizationAffiliations, "agency") ? true : base.agencyRisk,
    managementRisk: hasAffiliation(organizationAffiliations, "management") ? true : base.managementRisk,
    mcnRisk: hasAffiliation(organizationAffiliations, "mcn") ? true : base.mcnRisk,
    labelRisk: hasAffiliation(organizationAffiliations, "label") ? true : base.labelRisk,
    companyChannelRisk: hasAffiliation(organizationAffiliations, "company") ? true : base.companyChannelRisk,
    koreanAudienceSuitable: suitability.verificationState === "confirmed" ? suitability.koreanAudienceSuitable : null,
    foreignAudienceRisk: suitability.verificationState === "confirmed" ? suitability.foreignAudienceRisk : null,
    recruitmentSuitability: domesticActivitySatisfied ? true : domesticActivityRejected ? false : null,
    recruitmentEvidence: recruitment,
  };
}

function hasAffiliation(
  affiliations: RecruitmentEvidence["affiliations"],
  type: typeof organizationClassifications[number],
): boolean {
  return affiliations.some((item) => item.affiliationType === type);
}

function evidenceMissingClassification(recruitment: RecruitmentEvidence): VerificationEvidence["emailClassification"] {
  if (recruitment.contactVerificationState === "not_found") return "not_found";
  if (recruitment.contacts.length > 0) return "unknown";
  return "not_checked";
}
