import { describe, expect, it } from "vitest";
import { defaultRecommendationSettings } from "@/config/recommendation-rules";
import { mockCreatorInputs } from "@/data/creators";
import { createInitialHistory, evaluateMockRun } from "@/lib/mock-run";
import { evaluateCreator } from "@/server/rules/evaluate-creator";

const evaluate = (index: number) => evaluateCreator(mockCreatorInputs[index - 1], defaultRecommendationSettings, [], [], new Date("2026-07-22T07:00:00Z"));
describe("deterministic creator evaluation", () => {
  it("recommends a fully verified creator with personal email", () => expect(evaluate(1).decision).toBe("recommended"));
  it.each([[2, "missing_email"], [3, "email_not_checked"], [4, "email_ownership_unknown"], [5, "missing_verification"]] as const)("holds incomplete non-disqualifying scenario %i", (index, reason) => { const result = evaluate(index); expect(result.decision).toBe("hold"); expect(result.reasonCodes).toContain(reason); });
  it.each([[6, "channel_url_unconfirmed"], [7, "no_videos"], [12, "category_mismatch"], [13, "foreign_audience_heavy"], [14, "overseas_based"], [15, "official_channel"]] as const)("excludes confirmed hard-failure scenario %i", (index, reason) => { const result = evaluate(index); expect(result.decision).toBe("excluded"); expect(result.reasonCodes).toContain(reason); });
  it("keeps inactivity as a score signal instead of a hidden recommendation gate", () => {
    const result = evaluate(8);
    expect(result.decision).toBe("recommended");
    expect(result.reasonCodes).toContain("latest_upload_too_old");
    expect(result.recheckAt).toBeNull();
  });
  it.each([[9, "one recent video"], [10, "robust median reach"], [11, "viral volatility"]] as const)("can recommend scenario %i with %s", (index, _label) => {
    expect(evaluate(index).decision).toBe("recommended");
  });
  it.each([[16, "company_email"], [17, "agency_email"], [18, "management_email"], [19, "mcn_email"], [20, "label_email"]] as const)("always excludes representing-organization email scenario %i", (index, reason) => { const result = evaluate(index); expect(result.decision).toBe("excluded"); expect(result.reasonCodes).toContain(reason); });
  it("defensively excludes duplicate inputs that bypass pipeline checks", () => { const evaluated = evaluateMockRun(createInitialHistory()); expect(evaluated[20].reasonCodes).toContain("prior_history_duplicate"); expect(evaluated[21].reasonCodes).toContain("same_run_duplicate"); expect(evaluated[20].decision).toBe("excluded"); expect(evaluated[21].decision).toBe("excluded"); });
  it("manual correction overrides positive evidence", () => { const result = evaluate(23); expect(result.decision).toBe("excluded"); expect(result.reasonCodes).toContain("user_corrected_invalid"); });
  it("uses subscriber target as a scored preference rather than another hard gate", () => {
    const result = evaluate(24);
    expect(result.decision).toBe("recommended");
    expect(result.reasonCodes).toContain("too_large");
  });
  it("holds an unverified category instead of trusting the discovery category", () => {
    const source = mockCreatorInputs[0];
    const result = evaluateCreator({
      ...source,
      identity: { ...source.identity, discoveryCategory: "푸드", category: "미분류" },
      evidence: { ...source.evidence, categoryFit: null },
    }, defaultRecommendationSettings, [], [], new Date("2026-07-22T07:00:00Z"));
    expect(result.decision).toBe("hold");
    expect(result.reasonCodes).toContain("missing_verification");
    expect(result.missingVerificationFields).toContain("카테고리 적합성");
  });

  it("allows exceptional total fit to offset low views instead of hard-excluding it", () => {
    const base = mockCreatorInputs[0];
    const result = evaluateCreator({
      ...base,
      evidence: {
        ...base.evidence,
        recentVideoCount: 2,
        recentViewCounts: [102, 102],
        recentAverageViews: 102,
      },
    }, defaultRecommendationSettings, [], [], new Date("2026-07-22T07:00:00Z"));
    expect(result.decision).toBe("recommended");
    expect(result.reasonCodes).toContain("recent_views_below_threshold");
    expect(result.missingVerificationFields).not.toContain("대표 최근 조회수");
  });

  it("accepts exact channel-ID identity without a separate channel-name confirmation gate", () => {
    const base = mockCreatorInputs[0];
    const result = evaluateCreator({ ...base, evidence: { ...base.evidence, channelNameMatches: false } }, defaultRecommendationSettings, [], [], new Date("2026-07-22T07:00:00Z"));
    expect(result.decision).toBe("recommended");
    expect(result.reasonCodes).not.toContain("channel_name_mismatch");
    expect(result.missingVerificationFields).not.toContain("채널명 일치");
  });

  it("keeps unknown audience geography and unknown affiliation neutral", () => {
    const base = mockCreatorInputs[0];
    const result = evaluateCreator({
      ...base,
      evidence: {
        ...base.evidence,
        koreanAudienceSuitable: null,
        foreignAudienceRisk: null,
        agencyRisk: null,
        managementRisk: null,
        mcnRisk: null,
        labelRisk: null,
        recruitmentEvidence: {
          ...base.evidence.recruitmentEvidence,
          affiliationVerificationState: "not_checked",
        },
      },
    }, defaultRecommendationSettings, [], [], new Date("2026-07-22T07:00:00Z"));
    expect(result.decision).toBe("recommended");
    expect(result.missingVerificationFields).not.toContain("국내 시청자 적합");
    expect(result.missingVerificationFields).not.toContain("소속 여부");
  });

  it("allows likely Korean-language activity to satisfy domestic-activity evidence", () => {
    const base = mockCreatorInputs[0];
    const result = evaluateCreator({
      ...base,
      evidence: {
        ...base.evidence,
        recruitmentSuitability: null,
        koreanAudienceSuitable: null,
        recruitmentEvidence: {
          ...base.evidence.recruitmentEvidence,
          koreanLanguageActivity: {
            ...base.evidence.recruitmentEvidence.koreanLanguageActivity,
            recentTitleHangulPresenceRatio: 0.8,
            hangulCharacterRatio: 0.5,
            state: "likely",
          },
        },
      },
    }, defaultRecommendationSettings, [], [], new Date("2026-07-22T07:00:00Z"));
    expect(result.decision).toBe("recommended");
    expect(result.missingVerificationFields).not.toContain("국내 활동 적합성");
  });

  it("holds conflicting affiliation evidence", () => {
    const base = mockCreatorInputs[0];
    const result = evaluateCreator({
      ...base,
      evidence: {
        ...base.evidence,
        recruitmentEvidence: { ...base.evidence.recruitmentEvidence, affiliationVerificationState: "conflicting" },
      },
    }, defaultRecommendationSettings, [], [], new Date("2026-07-22T07:00:00Z"));
    expect(result.decision).toBe("hold");
    expect(result.reasonCodes).toContain("affiliation_conflict");
  });

  it("keeps excluded explanations free of hold wording and presents unchecked evidence separately", () => {
    const base = mockCreatorInputs[6];
    const result = evaluateCreator({
      ...base,
      evidence: { ...base.evidence, emailClassification: "not_found", visibleEmail: null },
    }, defaultRecommendationSettings, [], [], new Date("2026-07-22T07:00:00Z"));
    expect(result.decision).toBe("excluded");
    expect(result.koreanExplanation).not.toContain("보류");
    expect(result.koreanExplanation).toContain("게시된 영상이 없어 제외");
    expect(result.missingVerificationFields).toContain("대표 최근 조회수");
  });

  it("names the exact missing fields that cause a hold", () => {
    const base = mockCreatorInputs[0];
    const result = evaluateCreator({
      ...base,
      evidence: { ...base.evidence, recentVideoCount: null },
    }, defaultRecommendationSettings, [], [], new Date("2026-07-22T07:00:00Z"));
    expect(result.decision).toBe("hold");
    expect(result.missingVerificationFields).toEqual(["최근 영상 수"]);
    expect(result.koreanExplanation).toContain("최근 영상 수 확인이 필요합니다.");
    expect(result.koreanExplanation).not.toContain("일부 누락");
  });
});
