import { describe, expect, it } from "vitest";
import {
  PublicOfficialSiteClient,
  type RecruitmentFetch,
} from "@/server/providers/recruitment/public-web-client";
import { fictionalLiveConfig } from "../fixtures/live-recruitment-fixtures";

const ROOT = "https://official-h51.example.invalid/";

describe("approved public HTML collection", () => {
  it("uses robots.txt and follows only linked approved pages on the exact official domain", async () => {
    const requested: string[] = [];
    const client = webClient(async (url) => {
      requested.push(url);
      const path = new URL(url).pathname;
      if (path === "/robots.txt") return textResponse("User-agent: *\nAllow: /");
      if (path === "/") return htmlResponse(`
        <html><head><title>H5.1 허구 공식 사이트</title></head><body>
          <a href="/contact">Contact</a><a href="/news">News</a><a href="https://unrelated.example.invalid/about">Other</a>
          <p>H5.1 허구 크리에이터 공식 홈페이지</p>
        </body></html>`);
      if (path === "/contact") return htmlResponse("<html><body>Public contact h51@official-h51.example.invalid</body></html>");
      throw new Error("Unexpected fictional URL");
    });
    const result = await client.collect(ROOT);
    expect(result.pages.map((page) => new URL(page.url).pathname)).toEqual(["/", "/contact"]);
    expect(result.pages[1].text).toContain("h51@official-h51.example.invalid");
    expect(requested.some((url) => url.endsWith("/news"))).toBe(false);
    expect(requested.some((url) => url.includes("unrelated.example.invalid"))).toBe(false);
    expect(JSON.stringify(result)).not.toContain("<html>");
  });

  it("stops when robots.txt disallows collection", async () => {
    const client = webClient(async (url) => new URL(url).pathname === "/robots.txt"
      ? textResponse("User-agent: *\nDisallow: /")
      : htmlResponse("<html><body>must not be read</body></html>"));
    const result = await client.collect(ROOT);
    expect(result.pages).toEqual([]);
    expect(result.stopReasons).toContain("robots_disallowed");
  });

  it.each([
    ["<html><body>Sign in to continue</body></html>", "login_required"],
    ["<html><body><div class='g-recaptcha'>CAPTCHA</div></body></html>", "captcha"],
  ] as const)("stops on gated public HTML: %s", async (body, reason) => {
    const client = webClient(async (url) => new URL(url).pathname === "/robots.txt"
      ? textResponse("User-agent: *\nAllow: /")
      : htmlResponse(body));
    const result = await client.collect(ROOT);
    expect(result.pages).toEqual([]);
    expect(result.stopReasons).toContain(reason);
  });

  it("stops on request timeout", async () => {
    const fetcher: RecruitmentFetch = async (_url, init) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    });
    const result = await webClient(fetcher, { requestTimeoutMs: 5 }).collect(ROOT);
    expect(result.stopReasons).toContain("timeout");
  });

  it("retries HTTP 429 only within the configured bound and then stops", async () => {
    let pageRequests = 0;
    const client = webClient(async (url) => {
      if (new URL(url).pathname === "/robots.txt") return textResponse("User-agent: *\nAllow: /");
      pageRequests += 1;
      return new Response("rate limited", { status: 429, headers: { "content-type": "text/plain" } });
    }, { maxRateLimitRetries: 1 });
    const result = await client.collect(ROOT);
    expect(pageRequests).toBe(2);
    expect(result.stopReasons).toContain("rate_limited");
  });

  it.each([401, 403])("stops on HTTP %s without parsing the response body", async (status) => {
    const client = webClient(async (url) => new URL(url).pathname === "/robots.txt"
      ? textResponse("User-agent: *\nAllow: /")
      : new Response("private response must not be parsed", { status }));
    const result = await client.collect(ROOT);
    expect(result.pages).toEqual([]);
    expect(result.stopReasons).toContain("access_restricted");
    expect(JSON.stringify(result)).not.toContain("private response");
  });

  it("stops on unsupported public content without retaining its body", async () => {
    const client = webClient(async (url) => new URL(url).pathname === "/robots.txt"
      ? textResponse("User-agent: *\nAllow: /")
      : new Response("fictional binary payload", { status: 200, headers: { "content-type": "application/octet-stream" } }));
    const result = await client.collect(ROOT);
    expect(result.pages).toEqual([]);
    expect(result.stopReasons).toContain("unsupported_content");
    expect(JSON.stringify(result)).not.toContain("fictional binary payload");
  });

  it("stops on unrelated redirects and oversized responses", async () => {
    const redirectClient = webClient(async (url) => new URL(url).pathname === "/robots.txt"
      ? textResponse("User-agent: *\nAllow: /")
      : new Response(null, { status: 302, headers: { location: "https://unrelated.example.invalid/contact" } }));
    expect((await redirectClient.collect(ROOT)).stopReasons).toContain("unrelated_redirect");

    const oversizedClient = webClient(async (url) => new URL(url).pathname === "/robots.txt"
      ? textResponse("User-agent: *\nAllow: /")
      : new Response("x".repeat(500), { status: 200, headers: { "content-type": "text/html", "content-length": "500" } }), { maxResponseBytes: 100 });
    expect((await oversizedClient.collect(ROOT)).stopReasons).toContain("response_too_large");
  });
});

function webClient(
  fetcher: RecruitmentFetch,
  configPatch: Partial<ReturnType<typeof fictionalLiveConfig>> = {},
): PublicOfficialSiteClient {
  return new PublicOfficialSiteClient(fictionalLiveConfig(configPatch), {
    fetch: fetcher,
    delay: async () => undefined,
    isPublicHostname: async () => true,
  });
}

function htmlResponse(body: string): Response {
  return new Response(body, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
}

function textResponse(body: string): Response {
  return new Response(body, { status: 200, headers: { "content-type": "text/plain; charset=utf-8" } });
}
