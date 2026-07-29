import { describe, expect, it } from "vitest";
import { defaultRecommendationSettings, recommendationSettingsSchema } from "@/config/recommendation-rules";
import { validateNewRun } from "@/lib/validation";
import type { NewRunInput } from "@/types/domain";

const validInput: NewRunInput = { name: "뷰티 탐색", category: "뷰티", keywords: "스킨케어", targetRecommendedCount: 50, maximumDaysSinceLatestUpload: 56, minimumRecentAverageViews: 10000, minimumRecentVideoCount: 2 };
describe("configuration and form validation", () => {
  it("accepts valid run input", () => expect(validateNewRun(validInput)).toEqual({}));
  it("restricts the activity window to 7 through 60 days", () => {
    expect(validateNewRun({ ...validInput, maximumDaysSinceLatestUpload: 7 })).toEqual({});
    expect(validateNewRun({ ...validInput, maximumDaysSinceLatestUpload: 60 })).toEqual({});
    expect(validateNewRun({ ...validInput, maximumDaysSinceLatestUpload: 6 }).maximumDaysSinceLatestUpload).toBeDefined();
    expect(validateNewRun({ ...validInput, maximumDaysSinceLatestUpload: 61 }).maximumDaysSinceLatestUpload).toBeDefined();
    expect(recommendationSettingsSchema.parse({
      ...defaultRecommendationSettings,
      maximumDaysSinceLatestUpload: 7,
    }).maximumDaysSinceLatestUpload).toBe(7);
    expect(recommendationSettingsSchema.parse({
      ...defaultRecommendationSettings,
      maximumDaysSinceLatestUpload: 60,
    }).maximumDaysSinceLatestUpload).toBe(60);
    expect(() => recommendationSettingsSchema.parse({
      ...defaultRecommendationSettings,
      maximumDaysSinceLatestUpload: 6,
    })).toThrow();
    expect(() => recommendationSettingsSchema.parse({
      ...defaultRecommendationSettings,
      maximumDaysSinceLatestUpload: 61,
    })).toThrow();
  });
  it("rejects invalid runtime configuration", () => expect(() => recommendationSettingsSchema.parse({})).toThrow());
  it("allows automatic runs with only the recommendation target", () => expect(validateNewRun({
    ...validInput, discoveryMode: "automatic", name: "", category: "", keywords: "",
  })).toEqual({}));
  it("requires keywords only for manual discovery modes", () => {
    expect(validateNewRun({ ...validInput, discoveryMode: "manual_replace", keywords: "" }).keywords).toBeDefined();
    expect(validateNewRun({ ...validInput, discoveryMode: "manual_extend", keywords: "" }).keywords).toBeDefined();
  });
});
