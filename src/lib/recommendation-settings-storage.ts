import {
  defaultRecommendationSettings,
  recommendationSettingsSchema,
} from "@/config/recommendation-rules";
import type { RecommendationSettings } from "@/types/domain";

export const recommendationSettingsStorageKey = "creator-recommendation-settings-v2";

export function loadRecommendationSettings(
  storage: Pick<Storage, "getItem">,
): RecommendationSettings {
  const stored = storage.getItem(recommendationSettingsStorageKey);
  if (!stored) return defaultRecommendationSettings;
  const parsed: unknown = JSON.parse(stored);
  return recommendationSettingsSchema.parse(parsed);
}

export function saveRecommendationSettings(
  storage: Pick<Storage, "setItem">,
  settings: RecommendationSettings,
): RecommendationSettings {
  const validated = recommendationSettingsSchema.parse(settings);
  storage.setItem(recommendationSettingsStorageKey, JSON.stringify(validated));
  return validated;
}
