import { describe, expect, it } from "vitest";
import { defaultRecommendationSettings } from "@/config/recommendation-rules";
import {
  loadRecommendationSettings,
  recommendationSettingsStorageKey,
  saveRecommendationSettings,
} from "@/lib/recommendation-settings-storage";

function createMemoryStorage(initialValue: string | null = null): Pick<Storage, "getItem" | "setItem"> {
  let value = initialValue;
  return {
    getItem: (key: string) => key === recommendationSettingsStorageKey ? value : null,
    setItem: (key: string, nextValue: string) => {
      if (key === recommendationSettingsStorageKey) value = nextValue;
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
      allowedCategories: ["테크"],
    };

    saveRecommendationSettings(storage, settings);
    expect(loadRecommendationSettings(storage)).toEqual(settings);
  });

  it("rejects malformed stored settings instead of silently applying them", () => {
    expect(() => loadRecommendationSettings(createMemoryStorage("{malformed"))).toThrow();
  });
});
