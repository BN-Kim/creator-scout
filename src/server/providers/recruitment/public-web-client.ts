import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { load } from "cheerio";
import pLimit from "p-limit";
import robotsParser from "robots-parser";
import { getDomain } from "tldts";
import type { LiveRecruitmentProviderConfig } from "@/server/providers/recruitment/live-provider-config";
import type {
  OfficialSiteCollection,
  OfficialSiteCollector,
  PublicHtmlPage,
  PublicPageStopReason,
} from "@/server/providers/recruitment/live-source-types";

export type RecruitmentFetch = (url: string, init: RequestInit) => Promise<Response>;

export interface PublicWebClientDependencies {
  fetch?: RecruitmentFetch;
  delay?: (milliseconds: number) => Promise<void>;
  isPublicHostname?: (hostname: string) => Promise<boolean>;
}

interface PageFetchResult {
  page: PublicHtmlPage | null;
  stopReason: PublicPageStopReason | null;
}

const approvedPathPattern = /(?:^|[\/_-])(contact|about|business|team|profile|roster)(?:[\/_-]|$)/i;
const gatedContentPattern = /captcha|recaptcha|hcaptcha|cloudflare\s+challenge|sign\s*in\s+to\s+continue|log\s*in\s+to\s+continue|로그인(?:이|을)?\s*필요|자동입력\s*방지/iu;

export class PublicOfficialSiteClient implements OfficialSiteCollector {
  private readonly fetch: RecruitmentFetch;
  private readonly delay: (milliseconds: number) => Promise<void>;
  private readonly hostnamePolicy: (hostname: string) => Promise<boolean>;
  private readonly requestLimit;
  private readonly hostRequestLimits = new Map<string, ReturnType<typeof pLimit>>();
  private readonly nextHostRequestAt = new Map<string, number>();

  constructor(
    private readonly config: LiveRecruitmentProviderConfig,
    dependencies: PublicWebClientDependencies = {},
  ) {
    this.fetch = dependencies.fetch ?? ((url, init) => fetch(url, init));
    this.delay = dependencies.delay ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
    this.hostnamePolicy = dependencies.isPublicHostname ?? isPublicHostname;
    this.requestLimit = pLimit(config.maxConcurrency);
  }

  async collect(linkedUrl: string): Promise<OfficialSiteCollection> {
    const initial = safeHttpUrl(linkedUrl);
    if (!initial || !await this.hostnamePolicy(initial.hostname)) return stopped(linkedUrl, "identity_uncertain");
    const registrableDomain = registrableDomainOf(initial);
    if (!registrableDomain) return stopped(linkedUrl, "identity_uncertain");
    const approvedHostname = normalizeHostname(initial.hostname);
    const queue = [initial.toString()];
    const visited = new Set<string>();
    const pages: PublicHtmlPage[] = [];
    const stopReasons = new Set<PublicPageStopReason>();

    while (queue.length && pages.length < this.config.maxPagesPerSite) {
      const url = queue.shift();
      if (!url || visited.has(url)) continue;
      visited.add(url);
      const parsed = safeHttpUrl(url);
      if (!parsed || registrableDomainOf(parsed) !== registrableDomain || !sameOfficialHost(parsed.hostname, approvedHostname)) {
        stopReasons.add("unrelated_redirect");
        continue;
      }
      if (!await this.hostnamePolicy(parsed.hostname)) {
        stopReasons.add("identity_uncertain");
        continue;
      }
      const robotsAllowed = await this.isAllowedByRobots(parsed, registrableDomain, approvedHostname);
      if (!robotsAllowed.allowed) {
        stopReasons.add(robotsAllowed.reason);
        continue;
      }
      const result = await this.fetchHtmlPage(parsed, registrableDomain, approvedHostname);
      if (!result.page) {
        if (result.stopReason) stopReasons.add(result.stopReason);
        continue;
      }
      pages.push(result.page);
      for (const linked of result.page.linkedUrls) {
        const linkedParsed = safeHttpUrl(linked);
        if (!linkedParsed || registrableDomainOf(linkedParsed) !== registrableDomain || !sameOfficialHost(linkedParsed.hostname, approvedHostname)) continue;
        if (approvedPathPattern.test(linkedParsed.pathname) && !visited.has(linkedParsed.toString())) queue.push(linkedParsed.toString());
      }
    }

    return { requestedUrl: linkedUrl, registrableDomain, pages, stopReasons: [...stopReasons] };
  }

  private async isAllowedByRobots(
    url: URL,
    registrableDomain: string,
    approvedHostname: string,
  ): Promise<{ allowed: true } | { allowed: false; reason: PublicPageStopReason }> {
    const robotsUrl = new URL("/robots.txt", url.origin);
    const result = await this.fetchText(robotsUrl, registrableDomain, approvedHostname, false, 200_000);
    if (result.status === 404) return { allowed: true };
    if (result.stopReason) return { allowed: false, reason: result.stopReason };
    if (result.status < 200 || result.status >= 300 || result.text === null) return { allowed: false, reason: "temporary_failure" };
    const robots = robotsParser(robotsUrl.toString(), result.text);
    return robots.isAllowed(url.toString(), this.config.userAgent) === false
      ? { allowed: false, reason: "robots_disallowed" }
      : { allowed: true };
  }

  private async fetchHtmlPage(url: URL, registrableDomain: string, approvedHostname: string): Promise<PageFetchResult> {
    const response = await this.fetchText(url, registrableDomain, approvedHostname, true, this.config.maxResponseBytes);
    if (response.stopReason) return { page: null, stopReason: response.stopReason };
    if (response.status < 200 || response.status >= 300 || response.text === null) return { page: null, stopReason: "temporary_failure" };
    if (!response.contentType.toLowerCase().includes("text/html")) return { page: null, stopReason: "unsupported_content" };
    if (gatedContentPattern.test(response.text.slice(0, 200_000))) {
      return { page: null, stopReason: /captcha|recaptcha|hcaptcha|challenge/i.test(response.text) ? "captcha" : "login_required" };
    }
    try {
      const $ = load(response.text);
      $("script,style,noscript,template,svg").remove();
      const text = normalizeVisibleText($("body").text()).slice(0, 200_000);
      const linkedUrls = $("a[href]").toArray().flatMap((element) => {
        const href = $(element).attr("href");
        if (!href) return [];
        try {
          return [new URL(href, response.finalUrl).toString()];
        } catch {
          return [];
        }
      });
      if (!text) return { page: null, stopReason: "malformed_content" };
      return {
        page: { url: response.finalUrl, title: normalizeVisibleText($("title").text()) || null, text, linkedUrls },
        stopReason: null,
      };
    } catch {
      return { page: null, stopReason: "malformed_content" };
    }
  }

  private async fetchText(
    initialUrl: URL,
    registrableDomain: string,
    approvedHostname: string,
    allowRateLimitRetry: boolean,
    maxBytes: number,
  ): Promise<{ status: number; text: string | null; contentType: string; finalUrl: string; stopReason: PublicPageStopReason | null }> {
    let current = initialUrl;
    let redirects = 0;
    let rateLimitAttempts = 0;
    while (true) {
      if (registrableDomainOf(current) !== registrableDomain || !sameOfficialHost(current.hostname, approvedHostname)
        || !await this.hostnamePolicy(current.hostname)) {
        return stoppedFetch(current, "unrelated_redirect");
      }
      let response: Response;
      try {
        response = await this.requestLimit(() => this.rateLimitedFetch(current));
      } catch (error: unknown) {
        return stoppedFetch(current, error instanceof DOMException && error.name === "TimeoutError" ? "timeout" : "temporary_failure");
      }
      if (response.status === 401 || response.status === 403) return stoppedFetch(current, "access_restricted", response.status);
      if (response.status === 429) {
        if (!allowRateLimitRetry || rateLimitAttempts >= this.config.maxRateLimitRetries) return stoppedFetch(current, "rate_limited", 429);
        rateLimitAttempts += 1;
        await this.delay(this.config.minHostIntervalMs * (rateLimitAttempts + 1));
        continue;
      }
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location || redirects >= this.config.maxRedirects) return stoppedFetch(current, "unrelated_redirect", response.status);
        const next = safeHttpUrl(new URL(location, current).toString());
        if (!next || registrableDomainOf(next) !== registrableDomain || !sameOfficialHost(next.hostname, approvedHostname)) {
          return stoppedFetch(current, "unrelated_redirect", response.status);
        }
        current = next;
        redirects += 1;
        continue;
      }
      const contentLength = Number(response.headers.get("content-length"));
      if (Number.isFinite(contentLength) && contentLength > maxBytes) return stoppedFetch(current, "response_too_large", response.status);
      const text = await readBoundedText(response, maxBytes);
      if (text === null) return stoppedFetch(current, "response_too_large", response.status);
      return {
        status: response.status,
        text,
        contentType: response.headers.get("content-type") ?? "",
        finalUrl: current.toString(),
        stopReason: null,
      };
    }
  }

  private async rateLimitedFetch(url: URL): Promise<Response> {
    const hostLimit = this.hostRequestLimits.get(url.hostname) ?? pLimit(1);
    this.hostRequestLimits.set(url.hostname, hostLimit);
    return hostLimit(async () => {
      const now = Date.now();
      const nextAllowed = this.nextHostRequestAt.get(url.hostname) ?? now;
      if (nextAllowed > now) await this.delay(nextAllowed - now);
      this.nextHostRequestAt.set(url.hostname, Date.now() + this.config.minHostIntervalMs);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.config.requestTimeoutMs);
      try {
        return await this.fetch(url.toString(), {
          method: "GET",
          redirect: "manual",
          signal: controller.signal,
          headers: { "user-agent": this.config.userAgent, accept: "text/html,text/plain;q=0.9" },
        });
      } catch (error: unknown) {
        if (error instanceof Error && error.name === "AbortError") throw new DOMException("Request timed out.", "TimeoutError");
        throw new Error("Public page request failed.");
      } finally {
        clearTimeout(timeout);
      }
    });
  }
}

async function readBoundedText(response: Response, maxBytes: number): Promise<string | null> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const combined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(combined);
}

function stopped(requestedUrl: string, reason: PublicPageStopReason): OfficialSiteCollection {
  return { requestedUrl, registrableDomain: null, pages: [], stopReasons: [reason] };
}

function stoppedFetch(url: URL, reason: PublicPageStopReason, status = 0) {
  return { status, text: null, contentType: "", finalUrl: url.toString(), stopReason: reason };
}

function safeHttpUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return null;
    return url;
  } catch {
    return null;
  }
}

function registrableDomainOf(url: URL): string | null {
  return getDomain(url.hostname, { allowPrivateDomains: true })?.toLowerCase() ?? null;
}

function sameOfficialHost(hostname: string, approvedHostname: string): boolean {
  return normalizeHostname(hostname) === approvedHostname;
}

function normalizeHostname(hostname: string): string {
  return hostname.toLowerCase().replace(/\.$/, "").replace(/^www\./, "");
}

function normalizeVisibleText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

async function isPublicHostname(hostname: string): Promise<boolean> {
  const normalized = hostname.toLowerCase().replace(/\.$/, "");
  if (normalized === "localhost" || normalized.endsWith(".localhost") || normalized.endsWith(".local")) return false;
  try {
    const addresses = await lookup(normalized, { all: true, verbatim: true });
    return addresses.length > 0 && addresses.every(({ address }) => isPublicAddress(address));
  } catch {
    return false;
  }
}

function isPublicAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a, b] = address.split(".").map(Number);
    return !(a === 10 || a === 127 || a === 0 || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
      || (a === 100 && b >= 64 && b <= 127) || a >= 224);
  }
  if (isIP(address) === 6) {
    const normalized = address.toLowerCase();
    return !(normalized === "::1" || normalized === "::" || normalized.startsWith("fc")
      || normalized.startsWith("fd") || normalized.startsWith("fe8") || normalized.startsWith("fe9")
      || normalized.startsWith("fea") || normalized.startsWith("feb"));
  }
  return false;
}
