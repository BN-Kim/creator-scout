import { describe, expect, it } from "vitest";
import { defaultRecommendationSettings } from "@/config/recommendation-rules";
import {
  loadRecommendationSettings,
  legacyRecommendationSettingsStorageKey,
  recommendationSettingsStorageKey,
  saveRecommendationSettings,
} from "@/lib/recommendation-settings-storage";

function createMemoryStorage(initialValue: string | null = null, legacyValue: string | null = null): Pick<Storage, "getItem" | "setItem"> {
  const values = new Map<string, string>();
  if (initialValue !== null) values.set(recommendationSettingsStorageKey, initialValue);
  if (legacyValue !== null) values.set(legacyRecommendationSettingsStorageKey, legacyValue);
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, nextValue: string) => {
      values.set(key, nextValue);
    },
  };
}

describe("recommendation settings storage", () => {
  it("uses the shared defaults when no browser setting exists", () => {
    expect(loadRecommendationSettings(createMemoryStorage())).toEqual(defaultRecommendationSettings);
  });

  it("round-trips validated scouting criteria", () => {
    const storage = createMemoryStorage();
    const settings = {
      ...defaultRecommendationSettings,
      maximumDaysSinceLatestUpload: 21,
      minimumRecentAverageViews: 25000,
      minimumRecentVideoCount: 4,
      preferredRecentVideoCount: 4,
      allowedCategories: ["테크"],
    };

    saveRecommendationSettings(storage, settings);
    expect(loadRecommendationSettings(storage)).toEqual(settings);
  });

  it("rejects malformed stored settings instead of silently applying them", () => {
    expect(() => loadRecommendationSettings(createMemoryStorage("{malformed"))).toThrow();
  });

  it("migrates untouched legacy defaults to the marketing-fit defaults", () => {
    const legacy = {
      maximumDaysSinceLatestUpload: 56,
      minimumRecentVideoCount: 2,
      preferredRecentVideoCount: 3,
      minimumRecentAverageViews: 10_000,
      defaultRecentAverageWindow: 5,
      extendedRecentAverageWindow: 10,
      allowedCategories: ["뷰티"],
      blockedChannelTypes: defaultRecommendationSettings.blockedChannelTypes,
      excludedEmailClassifications: defaultRecommendationSettings.excludedEmailClassifications,
    };
    const migrated = loadRecommendationSettings(createMemoryStorage(null, JSON.stringify(legacy)));
    expect(migrated).toMatchObject({
      maximumDaysSinceLatestUpload: 90,
      minimumRecentVideoCount: 1,
      minimumRecentAverageViews: 5_000,
      allowedCategories: ["뷰티"],
    });
  });
});
