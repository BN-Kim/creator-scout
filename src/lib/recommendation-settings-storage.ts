import {
  defaultRecommendationSettings,
  recommendationSettingsSchema,
} from "@/config/recommendation-rules";
import type { RecommendationSettings } from "@/types/domain";

export const recommendationSettingsStorageKey = "creator-recommendation-settings-v3";
export const legacyRecommendationSettingsStorageKey = "creator-recommendation-settings-v2";

export function loadRecommendationSettings(
  storage: Pick<Storage, "getItem">,
): RecommendationSettings {
  const current = storage.getItem(recommendationSettingsStorageKey);
  if (current) return recommendationSettingsSchema.parse(JSON.parse(current) as unknown);

  const legacy = storage.getItem(legacyRecommendationSettingsStorageKey);
  if (!legacy) return defaultRecommendationSettings;
  const raw: unknown = JSON.parse(legacy);
  const parsed = recommendationSettingsSchema.parse(raw);
  return usesUnchangedLegacyDefaults(raw)
    ? {
        ...parsed,
        maximumDaysSinceLatestUpload: defaultRecommendationSettings.maximumDaysSinceLatestUpload,
        minimumRecentAverageViews: defaultRecommendationSettings.minimumRecentAverageViews,
        minimumRecentVideoCount: defaultRecommendationSettings.minimumRecentVideoCount,
      }
    : parsed;
}

export function saveRecommendationSettings(
  storage: Pick<Storage, "setItem">,
  settings: RecommendationSettings,
): RecommendationSettings {
  const validated = recommendationSettingsSchema.parse(settings);
  storage.setItem(recommendationSettingsStorageKey, JSON.stringify(validated));
  return validated;
}

function usesUnchangedLegacyDefaults(value: unknown): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return record.maximumDaysSinceLatestUpload === 56
    && record.minimumRecentAverageViews === 10_000
    && record.minimumRecentVideoCount === 2;
}
