import { randomUUID } from "node:crypto";
import { defaultRecommendationSettings } from "@/config/recommendation-rules";
import { automaticScoutingBackgroundRunLimitMs, backgroundRunTargetThreshold } from "@/config/automatic-scouting";
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
    safetyLimits: safetyLimitsForTarget(input.targetRecommendedCount),
    settings: {
      ...defaultRecommendationSettings,
      maximumDaysSinceLatestUpload: input.maximumDaysSinceLatestUpload,
      preferredRecentUploadDays: input.preferredRecentUploadDays,
      minimumRecentAverageViews: input.minimumRecentAverageViews,
      minimumRecentMedianViews: input.minimumRecentMedianViews,
      minimumEfficientCreatorMedianViews: input.minimumEfficientCreatorMedianViews,
      minimumViewSubscriberRatio: input.minimumViewSubscriberRatio,
      minimumRecentVideoCount: input.minimumRecentVideoCount,
      preferredRecentVideoCount: input.preferredRecentVideoCount,
      minimumSubscriberCount: input.minimumSubscriberCount,
      maximumSubscriberCount: input.maximumSubscriberCount,
      recommendationScoreThreshold: input.recommendationScoreThreshold,
      holdScoreThreshold: input.holdScoreThreshold,
      viralRiskPenalty: input.viralRiskPenalty,
      dynamicExclusionTtlDays: input.dynamicExclusionTtlDays,
      holdRecheckDays: input.holdRecheckDays,
      scoreWeights: { ...input.scoreWeights },
      allowedCategories: input.category
        ? [input.category]
        : (input.allowedCategories ?? discoveryTaxonomy.categories.map((category) => category.name)),
    },
  });
  saveAutomaticRunResult(result);
  return result;
}

function safetyLimitsForTarget(targetRecommendedCount: number) {
  const configured = loadAutomaticScoutingSafetyLimits();
  if (targetRecommendedCount < backgroundRunTargetThreshold) return configured;
  return {
    ...configured,
    maxRunDurationMs: process.env.SCOUTING_MAX_RUN_DURATION_MS
      ? configured.maxRunDurationMs
      : automaticScoutingBackgroundRunLimitMs,
    maxDiscoveryPages: process.env.SCOUTING_MAX_DISCOVERY_PAGES
      ? configured.maxDiscoveryPages
      : Math.min(configured.maxDiscoveryPages, 25),
    maxScannedCandidates: process.env.SCOUTING_MAX_SCANNED_CANDIDATES
      ? configured.maxScannedCandidates
      : Math.min(configured.maxScannedCandidates, 1_000),
  };
}
