import { describe, expect, it } from "vitest";
import { decisionLabels } from "@/config/labels";
import { defaultRecommendationSettings } from "@/config/recommendation-rules";
import { mockCreatorInputs } from "@/data/creators";
import { createInitialHistory, evaluateMockRun } from "@/lib/mock-run";
import { toHistoryStatus } from "@/server/history/history-record";
import { identitiesMatch } from "@/server/history/history-matcher";
import { groupResults } from "@/server/output/group-results";
import { evaluateCreator } from "@/server/rules/evaluate-creator";
import { goldenDecisionFixtures } from "../fixtures/golden-decisions";
import type { CreatorInput, EmailClassification } from "@/types/domain";

const now = new Date("2026-07-22T07:00:00Z");
const evaluate = (input: CreatorInput) => evaluateCreator(input, defaultRecommendationSettings, [], [], now);

describe("permanent product contracts", () => {
  it("allows exactly recommended, hold, and excluded decisions", () => expect(Object.keys(decisionLabels)).toEqual(["recommended", "hold", "excluded"]));

  it("never returns removed legacy decisions", () => {
    const removed = ["raw_discovery", "priority_candidate", "contact_ready", "final_qualified", "blocked_duplicate", "manual_review_required"];
    const decisions = evaluateMockRun(createInitialHistory()).map((creator) => creator.decision);
    expect(decisions.some((decision) => removed.includes(decision))).toBe(false);
  });

  it.each([
    ["company", "company_email"], ["agency", "agency_email"], ["management", "management_email"], ["mcn", "mcn_email"], ["label", "label_email"],
  ] as const)("confirmed %s email always excludes", (classification, reason) => {
    const base = mockCreatorInputs[0];
    const result = evaluate({ ...base, evidence: { ...base.evidence, emailClassification: classification, emailVerificationState: "confirmed", visibleEmail: `${classification}@organization.example.invalid` } });
    expect(result.decision).toBe("excluded");
    expect(result.reasonCodes).toContain(reason);
  });

  it("missing email cannot recommend", () => expect(evaluate(mockCreatorInputs[1]).decision).toBe("hold"));

  it("only confirmed personal email satisfies the recommendation email gate", () => {
    const classifications: EmailClassification[] = ["company", "agency", "management", "mcn", "label", "unknown", "not_found", "not_checked"];
    const base = mockCreatorInputs[0];
    expect(evaluate(base).decision).toBe("recommended");
    for (const classification of classifications) {
      const result = evaluate({ ...base, evidence: { ...base.evidence, emailClassification: classification, visibleEmail: classification === "not_found" || classification === "not_checked" ? null : `${classification}@example.invalid` } });
      expect(result.decision).not.toBe("recommended");
    }
  });

  it("hard exclusion overrides otherwise positive evidence", () => {
    const base = mockCreatorInputs[0];
    expect(evaluate({ ...base, evidence: { ...base.evidence, channelExists: false } }).decision).toBe("excluded");
  });

  it("prior-history duplicate excludes", () => {
    const result = evaluateCreator(mockCreatorInputs[20], defaultRecommendationSettings, createInitialHistory(), [], now);
    expect(result.decision).toBe("excluded"); expect(result.reasonCodes).toContain("prior_history_duplicate");
  });

  it("same-run duplicate excludes", () => {
    const result = evaluateCreator(mockCreatorInputs[21], defaultRecommendationSettings, [], [mockCreatorInputs[0].identity], now);
    expect(result.decision).toBe("excluded"); expect(result.reasonCodes).toContain("same_run_duplicate");
  });

  it("manual invalid correction excludes", () => expect(evaluate(mockCreatorInputs[22]).decision).toBe("excluded"));

  it("preserves decision-to-history mapping", () => {
    expect(toHistoryStatus("recommended")).toBe("recommended");
    expect(toHistoryStatus("hold")).toBe("candidate");
    expect(toHistoryStatus("excluded")).toBe("excluded");
  });

  it("generic search URLs cannot establish identity", () => {
    const base = mockCreatorInputs[0].identity;
    const left = { ...base, youtubeChannelId: null, youtubeHandle: null, canonicalChannelUrl: "https://www.youtube.com/results?search_query=mock", channelName: "목 왼쪽", normalizedChannelName: "목왼쪽" };
    const right = { ...left, channelName: "목 오른쪽", normalizedChannelName: "목오른쪽" };
    expect(identitiesMatch(left, right).matched).toBe(false);
  });

  it("places each creator in no more than one result group", () => {
    const evaluated = evaluateMockRun(createInitialHistory()); const groups = groupResults(evaluated);
    const ids = [...groups.recommended, ...groups.hold, ...groups.excluded].map((creator) => creator.identity.internalId);
    expect(ids).toHaveLength(evaluated.length); expect(new Set(ids).size).toBe(evaluated.length);
  });
});

describe("golden decision fixtures", () => {
  it.each(goldenDecisionFixtures)("keeps $name stable", (golden) => {
    const result = evaluateCreator(golden.input, defaultRecommendationSettings, golden.history, golden.sameRun, now);
    expect(result.decision).toBe(golden.expectedDecision);
    if (golden.expectedPrimaryReasonCode) expect(result.reasonCodes[0]).toBe(golden.expectedPrimaryReasonCode);
    else expect(result.reasonCodes).toHaveLength(0);
  });
});
