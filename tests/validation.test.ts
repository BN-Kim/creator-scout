import { describe, expect, it } from "vitest";
import { recommendationSettingsSchema } from "@/config/recommendation-rules";
import { validateNewRun } from "@/lib/validation";
import type { NewRunInput } from "@/types/domain";

const validInput: NewRunInput = { name: "뷰티 탐색", category: "뷰티", keywords: "스킨케어", targetRecommendedCount: 50, maximumDaysSinceLatestUpload: 56, minimumRecentAverageViews: 10000, minimumRecentVideoCount: 2 };
describe("configuration and form validation", () => {
  it("accepts valid run input", () => expect(validateNewRun(validInput)).toEqual({}));
  it("restricts the activity window to 42 through 56 days", () => { expect(validateNewRun({ ...validInput, maximumDaysSinceLatestUpload: 41 }).maximumDaysSinceLatestUpload).toBeDefined(); expect(validateNewRun({ ...validInput, maximumDaysSinceLatestUpload: 57 }).maximumDaysSinceLatestUpload).toBeDefined(); });
  it("rejects invalid runtime configuration", () => expect(() => recommendationSettingsSchema.parse({})).toThrow());
});
