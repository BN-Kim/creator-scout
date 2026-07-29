import { getDomain } from "tldts";
import type {
  OfficialSiteCollection,
  YouTubeRecruitmentSnapshot,
} from "@/server/providers/recruitment/live-source-types";
import type {
  ApprovedSourceDescriptor,
  RawAffiliationEvidence,
  RawPublicContactEvidence,
} from "@/server/providers/recruitment/provider-types";
import type { EmailClassification, OrganizationType } from "@/types/domain";
import {
  extractVisibleEmails,
  normalizeVisibleEmailText,
} from "@/server/providers/recruitment/visible-email-extractor";

const organizationPatterns: ReadonlyArray<[OrganizationType, RegExp]> = [
  ["mcn", /\bMCN\b|multi[- ]channel network|멀티채널|엠씨엔/iu],
  ["management", /\bmanager\b|\bmanagement\b|매니저|매니지먼트/iu],
  ["agency", /\bagency\b|에이전시|소속사/iu],
  ["label", /\blabel\b|레이블|음반사/iu],
  ["company", /\bcompany\b|\brepresentative\b|\bcorporation\b|\bcorp\.?\b|\bteam\b|회사|법인|대표|비즈니스팀/iu],
];
const personalSitePattern = /official\s+(?:site|website)|portfolio|creator|개인\s*(?:사이트|홈페이지)|공식\s*(?:사이트|홈페이지)|포트폴리오|크리에이터/iu;

export interface VisibleEmailClassificationInput {
  snapshot: YouTubeRecruitmentSnapshot;
  officialSites: OfficialSiteCollection[];
  consumerDomains: ReadonlySet<string>;
  organizationDomains: ReadonlySet<string>;
  checkedAt: string;
}

export interface VisibleEmailClassificationResult {
  contacts: RawPublicContactEvidence[];
  affiliations: RawAffiliationEvidence[];
}

interface TextSource {
  text: string;
  source: ApprovedSourceDescriptor;
  officialDomain: string | null;
  siteClassification: EmailClassification;
}

export function classifyVisibleRecruitmentEvidence(
  input: VisibleEmailClassificationInput,
): VisibleEmailClassificationResult {
  const sources = textSources(input.snapshot, input.officialSites);
  const officialDomainClassifications = new Map(input.officialSites.flatMap((site) => site.registrableDomain
    ? [[site.registrableDomain, classifyOfficialSite(site, input.snapshot.channelTitle)] as const]
    : []));
  const contacts = sources.flatMap((source) => contactsFromSource(
    source,
    input.consumerDomains,
    input.organizationDomains,
    officialDomainClassifications,
    input.checkedAt,
  ));
  const uniqueContacts = [...new Map(contacts.map((contact) => [
    `${contact.email?.toLowerCase()}:${contact.source.publicUrl}`,
    contact,
  ])).values()];
  const affiliations = siteAffiliations(input.officialSites, input.snapshot.channelTitle, input.checkedAt);
  if (uniqueContacts.length === 0) {
    const descriptionsComplete = input.snapshot.descriptionCollection.recentVideos !== "unavailable";
    uniqueContacts.push({
      kind: "contact",
      source: channelSource(input.snapshot),
      checkedAt: input.checkedAt,
      verificationState: descriptionsComplete ? "not_found" : "not_checked",
      email: null,
      declaredOwnerType: descriptionsComplete ? "not_found" : "not_checked",
    });
  }
  return { contacts: uniqueContacts, affiliations };
}

function textSources(snapshot: YouTubeRecruitmentSnapshot, sites: OfficialSiteCollection[]): TextSource[] {
  const sources: TextSource[] = [];
  if (snapshot.channelDescription) {
    sources.push({ text: snapshot.channelDescription, source: channelSource(snapshot), officialDomain: null, siteClassification: "unknown" });
  }
  for (const video of snapshot.recentVideos) {
    if (!video.description) continue;
    sources.push({
      text: video.description,
      source: {
        sourceId: `youtube-video:${video.videoId}`,
        sourceType: "youtube_video_description",
        publicUrl: `https://www.youtube.com/watch?v=${video.videoId}`,
      },
      officialDomain: null,
      siteClassification: "unknown",
    });
  }
  for (const site of sites) {
    const siteClassification = classifyOfficialSite(site, snapshot.channelTitle);
    for (const page of site.pages) {
      sources.push({
        text: page.text,
        source: {
          sourceId: `official-site:${page.url}`,
          sourceType: "creator_official_website",
          publicUrl: page.url,
        },
        officialDomain: site.registrableDomain,
        siteClassification,
      });
    }
  }
  return sources;
}

function contactsFromSource(
  source: TextSource,
  consumerDomains: ReadonlySet<string>,
  organizationDomains: ReadonlySet<string>,
  officialDomainClassifications: ReadonlyMap<string, EmailClassification>,
  checkedAt: string,
): RawPublicContactEvidence[] {
  const normalizedText = normalizeVisibleEmailText(source.text);
  return extractVisibleEmails(source.text).map((match): RawPublicContactEvidence => {
    const nearby = normalizedText.slice(Math.max(0, match.index - 160), match.index + match.length + 160);
    return {
      kind: "contact",
      source: source.source,
      checkedAt,
      verificationState: "confirmed",
      email: match.email,
      declaredOwnerType: classifyEmail(
        match.email,
        nearby,
        source,
        consumerDomains,
        organizationDomains,
        officialDomainClassifications,
      ),
    };
  });
}

function classifyEmail(
  email: string,
  nearby: string,
  source: TextSource,
  consumerDomains: ReadonlySet<string>,
  organizationDomains: ReadonlySet<string>,
  officialDomainClassifications: ReadonlyMap<string, EmailClassification>,
): EmailClassification {
  const explicitOrganization = organizationType(nearby);
  if (explicitOrganization) return explicitOrganization;
  const emailHost = email.split("@")[1] ?? "";
  const emailDomain = getDomain(emailHost, { allowPrivateDomains: true })?.toLowerCase() ?? emailHost.toLowerCase();
  if (organizationDomains.has(emailDomain) || organizationDomains.has(emailHost.toLowerCase())) return "company";
  if (consumerDomains.has(emailDomain) || consumerDomains.has(emailHost.toLowerCase())) return "personal";
  if (source.officialDomain && emailDomain === source.officialDomain) return source.siteClassification;
  return officialDomainClassifications.get(emailDomain) ?? "unknown";
}

function siteAffiliations(
  sites: OfficialSiteCollection[],
  channelName: string,
  checkedAt: string,
): RawAffiliationEvidence[] {
  return sites.flatMap((site): RawAffiliationEvidence[] => {
    const classification = classifyOfficialSite(site, channelName);
    if (!isOrganization(classification) || site.pages.length === 0) return [];
    const page = site.pages[0];
    return [{
      kind: "affiliation",
      source: { sourceId: `official-site:${page.url}`, sourceType: "creator_official_website", publicUrl: page.url },
      checkedAt,
      verificationState: "confirmed",
      affiliationType: classification,
      organizationName: page.title,
    }];
  });
}

function classifyOfficialSite(site: OfficialSiteCollection, channelName: string): EmailClassification {
  if (!site.registrableDomain || site.pages.length === 0 || site.stopReasons.includes("identity_uncertain")) return "unknown";
  const corpus = site.pages.map((page) => `${page.title ?? ""} ${page.text}`).join(" ").slice(0, 100_000);
  const organization = organizationType(corpus);
  if (organization) return organization;
  const normalizedCorpus = normalizeIdentityText(corpus);
  const normalizedChannel = normalizeIdentityText(channelName);
  if (normalizedChannel.length >= 2 && normalizedCorpus.includes(normalizedChannel) && personalSitePattern.test(corpus)) return "personal";
  return "unknown";
}

function organizationType(value: string): OrganizationType | null {
  for (const [type, pattern] of organizationPatterns) {
    const match = pattern.exec(value);
    if (!match) continue;
    const nearby = value.slice(Math.max(0, match.index - 30), match.index + match[0].length + 30);
    if (/\b(?:no|not|without|independent)\b|없음|없습니다|아님|무소속/iu.test(nearby)) continue;
    return type;
  }
  return null;
}

function isOrganization(value: EmailClassification): value is OrganizationType {
  return ["company", "agency", "management", "mcn", "label"].includes(value);
}

function normalizeIdentityText(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("ko-KR").replace(/[^\p{L}\p{N}]/gu, "");
}

function channelSource(snapshot: YouTubeRecruitmentSnapshot): ApprovedSourceDescriptor {
  return {
    sourceId: `youtube-channel:${snapshot.channelId}`,
    sourceType: "youtube_channel_about",
    publicUrl: `https://www.youtube.com/channel/${snapshot.channelId}`,
  };
}
