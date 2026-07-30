import { randomUUID } from "node:crypto";
import { defaultRecommendationSettings } from "@/config/recommendation-rules";
import { discoveryTaxonomy } from "@/server/discovery/discovery-taxonomy";
import { getServerDiscoveryStateRepository, getServerHistoryRepository } from "@/server/history/server-history-repository";
import type { AutomaticRunConfiguration } from "@/server/operations/operation-types";
import { createLiveRecruitmentEvidenceProvider } from "@/server/providers/recruitment/create-live-provider";
import { createConfiguredYouTubeProvider } from "@/server/providers/youtube/create-provider";
import { saveAutomaticRunResult } from "@/server/scouting/automatic-run-result-store";
import { loadAutomaticScoutingSafetyLimits } from "@/server/scouting/automatic-scouting-config";
import { AutomaticScoutingPipeline } from "@/server/scouting/automatic-scouting-pipeline";
import type { AutomaticScoutingRunResult } from "@/server/scouting/automatic-scouting-types";
import { runFictionalAutomaticScouting } from "@/server/scouting/fictional-automatic-run";

export async function executeAutomaticScouting(
  input: AutomaticRunConfiguration,
  runId = `automatic-${randomUUID()}`,
): Promise<AutomaticScoutingRunResult> {
  const historyRepository = getServerHistoryRepository();
  if (process.env.E2E_TEST_MODE === "1") {
    const result = await runFictionalAutomaticScouting(
      historyRepository, runId, input.targetRecommendedCount, input.discoveryMode,
      input.keywords.split(/[\n,]/).map((value) => value.trim()).filter(Boolean),
    );
    saveAutomaticRunResult(result);
    return result;
  }

  const provider = createConfiguredYouTubeProvider();
  const pipeline = new AutomaticScoutingPipeline({
    discoveryProvider: provider, identityProvider: provider, evidenceProvider: provider,
    recruitmentEvidenceProvider: createLiveRecruitmentEvidenceProvider(), historyRepository,
    discoveryStateRepository: getServerDiscoveryStateRepository(),
  });
  const result = await pipeline.run({
    runId, discoveryMode: input.discoveryMode,
    manualQueries: input.keywords.split(/[\n,]/).map((value) => value.trim()).filter(Boolean),
    ...(input.category ? { preferredCategory: input.category } : {}),
    targetRecommendedCount: input.targetRecommendedCount,
    safetyLimits: loadAutomaticScoutingSafetyLimits(),
    settings: {
      ...defaultRecommendationSettings,
      maximumDaysSinceLatestUpload: input.maximumDaysSinceLatestUpload,
      minimumRecentAverageViews: input.minimumRecentAverageViews,
      minimumRecentVideoCount: input.minimumRecentVideoCount,
      allowedCategories: input.category
        ? [input.category]
        : (input.allowedCategories ?? discoveryTaxonomy.categories.map((category) => category.name)),
    },
  });
  saveAutomaticRunResult(result);
  return result;
}
