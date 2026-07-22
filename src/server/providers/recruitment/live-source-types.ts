import type { RecruitmentEvidenceSource } from "@/types/domain";

export interface YouTubeRecruitmentVideo {
  videoId: string;
  title: string;
  description: string | null;
}

export interface YouTubeRecruitmentSnapshot {
  channelId: string;
  channelTitle: string;
  channelDescription: string | null;
  country: string | null;
  language: string | null;
  officialLinks: string[];
  recentVideos: YouTubeRecruitmentVideo[];
}

export interface YouTubeRecruitmentSourceClient {
  collectPublicRecruitmentSurface(channelId: string, maxVideos: number): Promise<YouTubeRecruitmentSnapshot>;
}

export type PublicPageStopReason =
  | "robots_disallowed"
  | "login_required"
  | "captcha"
  | "access_restricted"
  | "rate_limited"
  | "timeout"
  | "unrelated_redirect"
  | "identity_uncertain"
  | "unsupported_content"
  | "malformed_content"
  | "response_too_large"
  | "temporary_failure";

export interface PublicHtmlPage {
  url: string;
  title: string | null;
  text: string;
  linkedUrls: string[];
}

export interface OfficialSiteCollection {
  requestedUrl: string;
  registrableDomain: string | null;
  pages: PublicHtmlPage[];
  stopReasons: PublicPageStopReason[];
}

export interface OfficialSiteCollector {
  collect(linkedUrl: string): Promise<OfficialSiteCollection>;
}

export interface SafeRecruitmentRawSummary {
  sourceUrls: string[];
  checkedAt: string;
  stopReasons: PublicPageStopReason[];
  itemCount: number;
}

export type LiveRecruitmentSource = RecruitmentEvidenceSource["sourceType"];
