import type { LiveRecruitmentProviderConfig } from "@/server/providers/recruitment/live-provider-config";
import { getDomain } from "tldts";
import type {
  OfficialSiteCollection,
  YouTubeRecruitmentSnapshot,
} from "@/server/providers/recruitment/live-source-types";

export const H51_NOW = "2026-07-22T08:00:00.000Z";
export const H51_CHANNEL_ID = `UC${"l".repeat(22)}`;
export const H51_CHANNEL_NAME = "H5.1 허구 크리에이터";

export function fictionalLiveConfig(
  patch: Partial<LiveRecruitmentProviderConfig> = {},
): LiveRecruitmentProviderConfig {
  return {
    consumerDomains: new Set(["gmail.com", "naver.com", "daum.net", "hanmail.net", "kakao.com"]),
    requestTimeoutMs: 25,
    maxPagesPerSite: 5,
    maxOfficialSites: 3,
    maxRedirects: 2,
    maxResponseBytes: 50_000,
    maxConcurrency: 2,
    minHostIntervalMs: 0,
    maxRateLimitRetries: 1,
    recentVideoLimit: 20,
    userAgent: "H51FictionalTestBot/1.0",
    ...patch,
  };
}

export function fictionalYouTubeSnapshot(
  patch: Partial<YouTubeRecruitmentSnapshot> = {},
): YouTubeRecruitmentSnapshot {
  return {
    channelId: H51_CHANNEL_ID,
    channelTitle: H51_CHANNEL_NAME,
    channelDescription: null,
    country: null,
    language: null,
    officialLinks: [],
    recentVideos: [],
    ...patch,
  };
}

export function fictionalOfficialSite(
  domain: string,
  text: string,
  title: string | null = null,
  patch: Partial<OfficialSiteCollection> = {},
): OfficialSiteCollection {
  const url = `https://${domain}/`;
  return {
    requestedUrl: url,
    registrableDomain: getDomain(domain, { allowPrivateDomains: true }),
    pages: [{ url, title, text, linkedUrls: [] }],
    stopReasons: [],
    ...patch,
  };
}
