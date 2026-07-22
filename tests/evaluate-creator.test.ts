import { describe, expect, it } from "vitest";
import { defaultRecommendationSettings } from "@/config/recommendation-rules";
import { mockCreatorInputs } from "@/data/creators";
import { createInitialHistory, evaluateMockRun } from "@/lib/mock-run";
import { evaluateCreator } from "@/server/rules/evaluate-creator";

const evaluate = (index: number) => evaluateCreator(mockCreatorInputs[index - 1], defaultRecommendationSettings, [], [], new Date("2026-07-22T07:00:00Z"));
describe("deterministic creator evaluation", () => {
  it("recommends a fully verified creator with personal email", () => expect(evaluate(1).decision).toBe("recommended"));
  it.each([[2, "missing_email"], [3, "email_not_checked"], [4, "email_ownership_unknown"], [5, "missing_verification"]] as const)("holds incomplete non-disqualifying scenario %i", (index, reason) => { const result = evaluate(index); expect(result.decision).toBe("hold"); expect(result.reasonCodes).toContain(reason); });
  it.each([[6, "channel_url_unconfirmed"], [7, "no_videos"], [8, "latest_upload_too_old"], [9, "insufficient_recent_video_count"], [10, "recent_views_below_threshold"], [11, "viral_video_distortion"], [12, "category_mismatch"], [13, "foreign_audience_heavy"], [14, "overseas_based"], [15, "official_channel"]] as const)("excludes hard-failure scenario %i", (index, reason) => { const result = evaluate(index); expect(result.decision).toBe("excluded"); expect(result.reasonCodes).toContain(reason); });
  it.each([[16, "company_email"], [17, "agency_email"], [18, "management_email"], [19, "mcn_email"], [20, "label_email"]] as const)("always excludes representing-organization email scenario %i", (index, reason) => { const result = evaluate(index); expect(result.decision).toBe("excluded"); expect(result.reasonCodes).toContain(reason); });
  it("defensively excludes duplicate inputs that bypass pipeline checks", () => { const evaluated = evaluateMockRun(createInitialHistory()); expect(evaluated[20].reasonCodes).toContain("prior_history_duplicate"); expect(evaluated[21].reasonCodes).toContain("same_run_duplicate"); expect(evaluated[20].decision).toBe("excluded"); expect(evaluated[21].decision).toBe("excluded"); });
  it("manual correction overrides positive evidence", () => { const result = evaluate(23); expect(result.decision).toBe("excluded"); expect(result.reasonCodes).toContain("user_corrected_invalid"); });
  it("does not invent a subscriber threshold", () => { const result = evaluate(24); expect(result.decision).toBe("recommended"); expect(result.warningChecks.join(" ")).toContain("구독자 기준"); });
});
