const requiredConsumerDomains = ["gmail.com", "naver.com", "daum.net", "hanmail.net", "kakao.com"] as const;
const requiredOrganizationDomains = ["cj.net"] as const;

export interface LiveRecruitmentProviderConfig {
  consumerDomains: ReadonlySet<string>;
  organizationDomains: ReadonlySet<string>;
  requestTimeoutMs: number;
  youtubeSurfaceTimeoutMs: number;
  maxPagesPerSite: number;
  maxOfficialSites: number;
  maxRedirects: number;
  maxResponseBytes: number;
  maxConcurrency: number;
  minHostIntervalMs: number;
  maxRateLimitRetries: number;
  recentVideoLimit: number;
  userAgent: string;
}

export function loadLiveRecruitmentProviderConfig(
  environment: NodeJS.ProcessEnv = process.env,
): LiveRecruitmentProviderConfig {
  const configuredDomains = (environment.RECRUITMENT_CONSUMER_DOMAINS ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  const configuredOrganizationDomains = (environment.RECRUITMENT_ORGANIZATION_DOMAINS ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return {
    consumerDomains: new Set([...requiredConsumerDomains, ...configuredDomains]),
    organizationDomains: new Set([...requiredOrganizationDomains, ...configuredOrganizationDomains]),
    requestTimeoutMs: integerSetting(environment.RECRUITMENT_REQUEST_TIMEOUT_MS, 8_000, 500, 30_000),
    youtubeSurfaceTimeoutMs: integerSetting(environment.RECRUITMENT_YOUTUBE_SURFACE_TIMEOUT_MS, 30_000, 1_000, 120_000),
    maxPagesPerSite: integerSetting(environment.RECRUITMENT_MAX_PAGES_PER_SITE, 6, 1, 20),
    maxOfficialSites: integerSetting(environment.RECRUITMENT_MAX_OFFICIAL_SITES, 3, 1, 10),
    maxRedirects: integerSetting(environment.RECRUITMENT_MAX_REDIRECTS, 3, 0, 5),
    maxResponseBytes: integerSetting(environment.RECRUITMENT_MAX_RESPONSE_BYTES, 1_000_000, 10_000, 5_000_000),
    maxConcurrency: integerSetting(environment.RECRUITMENT_MAX_CONCURRENCY, 3, 1, 10),
    minHostIntervalMs: integerSetting(environment.RECRUITMENT_MIN_HOST_INTERVAL_MS, 500, 0, 10_000),
    maxRateLimitRetries: integerSetting(environment.RECRUITMENT_MAX_429_RETRIES, 1, 0, 2),
    recentVideoLimit: 20,
    userAgent: "CreatorRecommenderBot/0.1",
  };
}

function integerSetting(value: string | undefined, fallback: number, minimum: number, maximum: number): number {
  if (value === undefined || !value.trim()) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error("리크루팅 공급자 숫자 설정이 허용 범위를 벗어났습니다.");
  }
  return parsed;
}
