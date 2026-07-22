import { describe, expect, it } from "vitest";
import { defaultRecommendationSettings } from "@/config/recommendation-rules";
import { mockCreatorInputs } from "@/data/creators";
import { evaluateKoreanLanguageActivity } from "@/server/providers/recruitment/korean-language-activity";
import { loadLiveRecruitmentProviderConfig } from "@/server/providers/recruitment/live-provider-config";
import {
  LiveRecruitmentEvidenceProvider,
  LiveRecruitmentProviderError,
} from "@/server/providers/recruitment/live-recruitment-provider";
import type {
  OfficialSiteCollection,
  OfficialSiteCollector,
  YouTubeRecruitmentSnapshot,
  YouTubeRecruitmentSourceClient,
} from "@/server/providers/recruitment/live-source-types";
import { applyRecruitmentEvidence } from "@/server/providers/recruitment/verification-evidence";
import { evaluateCreator } from "@/server/rules/evaluate-creator";
import {
  fictionalLiveConfig,
  fictionalOfficialSite,
  fictionalYouTubeSnapshot,
  H51_CHANNEL_ID,
  H51_CHANNEL_NAME,
  H51_NOW,
} from "../fixtures/live-recruitment-fixtures";

const REQUEST = {
  channelId: H51_CHANNEL_ID,
  channelName: H51_CHANNEL_NAME,
  canonicalChannelUrl: `https://www.youtube.com/channel/${H51_CHANNEL_ID}`,
};

describe("H5.1 live recruitment provider", () => {
  it("keeps the required consumer domains while allowing configured additions", () => {
    const config = loadLiveRecruitmentProviderConfig({ ...process.env, RECRUITMENT_CONSUMER_DOMAINS: "examplemail.invalid" });
    expect([...config.consumerDomains]).toEqual(expect.arrayContaining([
      "gmail.com", "naver.com", "daum.net", "hanmail.net", "kakao.com", "examplemail.invalid",
    ]));
  });

  it.each([
    ["gmail.com", "youtube_channel_about"],
    ["naver.com", "youtube_video_description"],
  ] as const)("accepts a visibly published %s consumer contact", async (domain, sourceType) => {
    const snapshot = sourceType === "youtube_channel_about"
      ? fictionalYouTubeSnapshot({ channelDescription: `공개 문의: hello@${domain}` })
      : fictionalYouTubeSnapshot({ recentVideos: [{ videoId: "h51-visible-contact", title: "허구 영상", description: `연락: hello@${domain}` }] });
    const result = await collect(snapshot);
    expect(result.normalized.contacts[0]).toMatchObject({
      email: `hello@${domain}`,
      classification: "personal",
      verificationState: "confirmed",
      source: { sourceType },
    });
  });

  it("classifies a consumer address labeled as management contact as organization-owned", async () => {
    const result = await collect(fictionalYouTubeSnapshot({
      channelDescription: "Management representative: creator.manager@gmail.com",
    }));
    expect(result.normalized.contacts[0]).toMatchObject({ classification: "management", email: "creator.manager@gmail.com" });
  });

  it("feeds confirmed live organization contact into the existing exclusion hard gate", async () => {
    const recruitment = (await collect(fictionalYouTubeSnapshot({
      channelDescription: "Management representative: creator.manager@gmail.com",
    }))).normalized;
    const input = {
      ...mockCreatorInputs[0],
      evidence: applyRecruitmentEvidence(mockCreatorInputs[0].evidence, recruitment),
    };
    const result = evaluateCreator(input, defaultRecommendationSettings, [], [], new Date(H51_NOW));

    expect(result.decision).toBe("excluded");
    expect(result.reasonCodes).toContain("management_email");
  });

  it("classifies a creator-owned custom domain only when the verified site establishes personal ownership", async () => {
    const domain = "creator-h51.example.invalid";
    const result = await collect(
      fictionalYouTubeSnapshot({ officialLinks: [`https://${domain}/`] }),
      [fictionalOfficialSite(domain, `${H51_CHANNEL_NAME} 공식 홈페이지 포트폴리오 문의 hello@${domain}`, H51_CHANNEL_NAME)],
    );
    expect(result.normalized.contacts[0]).toMatchObject({ classification: "personal", email: `hello@${domain}` });
    expect(result.normalized.affiliations).toEqual([]);
  });

  it("uses the exact linked official site to classify a custom-domain email published on YouTube", async () => {
    const domain = "creator-linked-h51.example.invalid";
    const result = await collect(
      fictionalYouTubeSnapshot({
        channelDescription: `공개 문의 hello@${domain}`,
        officialLinks: [`https://${domain}/`],
      }),
      [fictionalOfficialSite(domain, `${H51_CHANNEL_NAME} 공식 홈페이지 포트폴리오`, H51_CHANNEL_NAME)],
    );
    expect(result.normalized.contacts[0]).toMatchObject({
      classification: "personal",
      email: `hello@${domain}`,
      source: { sourceType: "youtube_channel_about" },
    });
  });

  it.each([
    ["mcn", "fictional-mcn.example.invalid", "Fictional MCN roster"],
    ["agency", "fictional-agency.example.invalid", "Fictional Agency roster"],
  ] as const)("confirms an explicitly identified %s custom-domain contact", async (classification, domain, label) => {
    const result = await collect(
      fictionalYouTubeSnapshot({ officialLinks: [`https://${domain}/`] }),
      [fictionalOfficialSite(domain, `${label} ${H51_CHANNEL_NAME} contact hello@${domain}`, label)],
    );
    expect(result.normalized.contacts[0]).toMatchObject({ classification, email: `hello@${domain}` });
    expect(result.normalized.affiliations[0]).toMatchObject({ affiliationType: classification, verificationState: "confirmed" });
  });

  it("keeps an ambiguous custom domain unknown", async () => {
    const domain = "ambiguous-h51.example.invalid";
    const result = await collect(
      fictionalYouTubeSnapshot({ officialLinks: [`https://${domain}/`] }),
      [fictionalOfficialSite(domain, `Welcome. hello@${domain}`, "Welcome")],
    );
    expect(result.normalized.contacts[0]).toMatchObject({ classification: "unknown", email: `hello@${domain}` });
  });

  it("records not-found when inspected public descriptions contain no visible email", async () => {
    const result = await collect(fictionalYouTubeSnapshot({ channelDescription: "공개 소개이지만 이메일은 없습니다." }));
    expect(result.normalized).toMatchObject({ contactVerificationState: "not_found", contacts: [{ email: null, verificationState: "not_found" }] });
  });

  it("keeps audience geography unknown while recording Korean-language activity separately", async () => {
    const result = await collect(fictionalYouTubeSnapshot({
      country: "KR",
      language: "ko",
      recentVideos: koreanVideos(20),
    }));
    expect(result.normalized.koreanLanguageActivity).toMatchObject({
      recentTitleHangulPresenceRatio: 1,
      explicitKoreanCountryOrActivityEvidence: true,
      state: "likely",
    });
    expect(result.normalized.koreanSuitability).toMatchObject({
      koreanAudienceSuitable: null,
      verificationState: "not_checked",
    });
  });

  it("returns unchecked evidence on YouTube timeout without exposing provider content", async () => {
    const provider = new LiveRecruitmentEvidenceProvider(fictionalLiveConfig({ requestTimeoutMs: 5 }), {
      youtubeClientFactory: async () => ({ collectPublicRecruitmentSurface: async () => new Promise(() => undefined) }),
      now: () => new Date(H51_NOW),
    });
    const result = await provider.collectEvidence(REQUEST);
    expect(result.normalized.contactVerificationState).toBe("not_checked");
    expect(result.raw.summary.stopReasons).toEqual(["timeout"]);
  });

  it("sanitizes unexpected provider failures and never exposes secrets or response bodies", async () => {
    const provider = new LiveRecruitmentEvidenceProvider(fictionalLiveConfig(), {
      youtubeClientFactory: async () => ({
        collectPublicRecruitmentSurface: async () => { throw new Error("SECRET_TOKEN <html>private response</html>"); },
      }),
    });
    let caught: unknown;
    try {
      await provider.collectEvidence(REQUEST);
    } catch (error: unknown) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(LiveRecruitmentProviderError);
    expect(String(caught)).not.toMatch(/SECRET_TOKEN|<html>|private response/);
  });

  it("uses bounded concurrency while collecting exact channel-linked official sites", async () => {
    let active = 0;
    let maximum = 0;
    const links = [1, 2, 3].map((index) => `https://site-${index}.example.invalid/`);
    const collector: OfficialSiteCollector = {
      collect: async (url) => {
        active += 1;
        maximum = Math.max(maximum, active);
        await new Promise((resolve) => setTimeout(resolve, 2));
        active -= 1;
        return fictionalOfficialSite(new URL(url).hostname, "허구 공개 페이지");
      },
    };
    await collect(fictionalYouTubeSnapshot({ officialLinks: links }), [], collector);
    expect(maximum).toBeLessThanOrEqual(2);
  });
});

describe("deterministic Korean-language activity evidence", () => {
  it("marks Korean-dominant recent titles as likely", () => {
    const result = evaluateKoreanLanguageActivity(fictionalYouTubeSnapshot({ recentVideos: koreanVideos(20) }), H51_NOW);
    expect(result).toMatchObject({ recentTitleHangulPresenceRatio: 1, state: "likely" });
    expect(result.hangulCharacterRatio).toBeGreaterThan(0.3);
  });

  it("keeps mixed-language titles unclear", () => {
    const videos = Array.from({ length: 10 }, (_, index) => ({
      videoId: `h51-mixed-${index}`,
      title: index < 5 ? `한 ${"English words ".repeat(4)}${index}` : `English title with several words ${index}`,
      description: null,
    }));
    const result = evaluateKoreanLanguageActivity(fictionalYouTubeSnapshot({ recentVideos: videos }), H51_NOW);
    expect(result).toMatchObject({ recentTitleHangulPresenceRatio: 0.5, state: "unclear" });
  });

  it("preserves missing country and language metadata without inventing them", () => {
    const result = evaluateKoreanLanguageActivity(fictionalYouTubeSnapshot({
      channelTitle: "Fictional Creator",
      country: null,
      language: null,
      recentVideos: [{ videoId: "h51-missing-metadata", title: "A short title", description: null }],
    }), H51_NOW);
    expect(result).toMatchObject({
      countryMetadata: null,
      languageMetadata: null,
      explicitKoreanCountryOrActivityEvidence: false,
      state: "unclear",
    });
  });
});

async function collect(
  snapshot: YouTubeRecruitmentSnapshot,
  sites: OfficialSiteCollection[] = [],
  collector?: OfficialSiteCollector,
) {
  const byUrl = new Map(sites.map((site) => [site.requestedUrl, site]));
  const siteCollector: OfficialSiteCollector = collector ?? {
    collect: async (url) => byUrl.get(url) ?? { requestedUrl: url, registrableDomain: null, pages: [], stopReasons: ["identity_uncertain"] },
  };
  const client: YouTubeRecruitmentSourceClient = { collectPublicRecruitmentSurface: async () => snapshot };
  const provider = new LiveRecruitmentEvidenceProvider(fictionalLiveConfig(), {
    youtubeClientFactory: async () => client,
    officialSiteCollector: siteCollector,
    now: () => new Date(H51_NOW),
  });
  return provider.collectEvidence(REQUEST);
}

function koreanVideos(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    videoId: `h51-korean-${index}`,
    title: `한국어 활동 영상 ${index + 1}`,
    description: "서울에서 만드는 허구 콘텐츠입니다.",
  }));
}
