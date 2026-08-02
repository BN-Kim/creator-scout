import { randomUUID } from "node:crypto";
import {
  defaultRecommendationSettings,
  isPermanentHardExclusionReason,
  recommendationRuleVersion,
} from "@/config/recommendation-rules";
import { createHistoryRecord } from "@/server/history/history-record";
import type { HistoryRepository } from "@/server/history/history-repository";
import { getServerHistoryRepository } from "@/server/history/server-history-repository";
import { evaluateCreator } from "@/server/rules/evaluate-creator";
import { defaultAutomaticScoutingSafetyLimits } from "@/server/scouting/automatic-scouting-config";
import type {
  AutomaticScoutingDecisionBreakdown,
  AutomaticScoutingDiagnostics,
  AutomaticScoutingRunResult,
} from "@/server/scouting/automatic-scouting-types";
import { getServerAutomaticRunResultRepository } from "@/server/scouting/server-automatic-run-result-repository";
import type {
  CreatorInput,
  EvaluatedCreator,
  HistoryRecord,
  RecommendationSettings,
} from "@/types/domain";

interface StoredRunRepository {
  get(runId: string): AutomaticScoutingRunResult | null;
  save(result: AutomaticScoutingRunResult): void;
}

export interface AutomaticRunReevaluationDependencies {
  historyRepository: HistoryRepository;
  runRepository: StoredRunRepository;
  now?: () => Date;
  createId?: () => string;
}

export interface AutomaticRunReevaluationRequest {
  sourceRunId: string;
  settings?: RecommendationSettings;
}

/**
 * Replays already collected evidence through the current rules without spending
 * YouTube API quota. Manual decisions are copied into the new result unchanged.
 */
export function reevaluateAutomaticRun(
  request: AutomaticRunReevaluationRequest,
  dependencies: AutomaticRunReevaluationDependencies,
): AutomaticScoutingRunResult {
  const sourceRun = dependencies.runRepository.get(request.sourceRunId);
  if (!sourceRun) throw new AutomaticRunReevaluationError("source_not_found");
  if (sourceRun.results.length === 0) throw new AutomaticRunReevaluationError("source_empty");

  const settings = cloneSettings(request.settings ?? defaultRecommendationSettings);
  const now = dependencies.now ?? (() => new Date());
  const startedAt = now();
  const createId = dependencies.createId ?? randomUUID;
  const runId = `automatic-reevaluation-${createId()}`;
  const results: EvaluatedCreator[] = [];
  const diagnostics = createEmptyDiagnostics();
  let manualOverrideSkipped = 0;
  let reevaluated = 0;

  for (const sourceCreator of sourceRun.results) {
    const history = dependencies.historyRepository.findDuplicate(sourceCreator.identity);
    const manual = isManualDecision(sourceCreator, history);
    const creator = manual
      ? copyManualDecision(sourceCreator, history)
      : reevaluateCreator(sourceCreator, settings, now());

    if (manual) {
      manualOverrideSkipped += 1;
    } else {
      reevaluated += 1;
      dependencies.historyRepository.addOrUpdate(
        createHistoryRecord(creator, runId, history?.createdAt),
      );
    }
    results.push(creator);
    recordDiagnostics(diagnostics, creator, settings.recommendationScoreThreshold);
  }

  const recommended = results.filter((creator) => creator.decision === "recommended").length;
  const hold = results.filter((creator) => creator.decision === "hold").length;
  const excluded = results.filter((creator) => creator.decision === "excluded").length;
  const completedAt = now().toISOString();
  const sourceSnapshot = sourceRun.requestSnapshot;
  const result: AutomaticScoutingRunResult = {
    runId,
    runKind: "reevaluation",
    sourceRunId: sourceRun.runId,
    status: "completed",
    startedAt: startedAt.toISOString(),
    completedAt,
    statistics: {
      discoveryMode: sourceSnapshot?.discoveryMode ?? sourceRun.statistics.discoveryMode,
      queriesAttempted: 0,
      pagesScanned: 0,
      targetRecommendedCount: sourceRun.statistics.targetRecommendedCount,
      recommendationsFilled: recommended,
      discovered: 0,
      priorHistorySkipped: 0,
      historyReevaluated: reevaluated,
      manualOverrideSkipped,
      sameRunDuplicatesSkipped: 0,
      evaluated: reevaluated,
      recommended,
      hold,
      excluded,
      failed: 0,
      stopReason: recommended >= sourceRun.statistics.targetRecommendedCount
        ? "target_reached"
        : "source_exhausted",
    },
    results,
    skips: [],
    failures: [],
    requestSnapshot: {
      discoveryMode: sourceSnapshot?.discoveryMode ?? sourceRun.statistics.discoveryMode,
      manualQueries: [...(sourceSnapshot?.manualQueries ?? [])],
      preferredCategory: sourceSnapshot?.preferredCategory ?? null,
      targetRecommendedCount: sourceRun.statistics.targetRecommendedCount,
      recentVideoLimit: sourceSnapshot?.recentVideoLimit ?? null,
      safetyLimits: { ...(sourceSnapshot?.safetyLimits ?? defaultAutomaticScoutingSafetyLimits) },
      settings,
      ruleVersion: recommendationRuleVersion,
    },
    diagnostics,
  };
  dependencies.runRepository.save(result);
  return result;
}

export function reevaluateServerAutomaticRun(
  sourceRunId: string,
  settings: RecommendationSettings = defaultRecommendationSettings,
): AutomaticScoutingRunResult {
  return reevaluateAutomaticRun(
    { sourceRunId, settings },
    {
      historyRepository: getServerHistoryRepository(),
      runRepository: getServerAutomaticRunResultRepository(),
    },
  );
}

export class AutomaticRunReevaluationError extends Error {
  constructor(public readonly reason: "source_not_found" | "source_empty") {
    super(reason === "source_not_found"
      ? "재평가할 실행 결과를 찾을 수 없습니다."
      : "재평가할 후보 근거가 없습니다.");
    this.name = "AutomaticRunReevaluationError";
  }
}

function reevaluateCreator(
  source: EvaluatedCreator,
  settings: RecommendationSettings,
  evaluatedAt: Date,
): EvaluatedCreator {
  const input: CreatorInput = {
    identity: source.identity,
    evidence: source.evidence,
    mockScenario: source.mockScenario,
    manualCorrection: null,
  };
  return {
    ...input,
    ...evaluateCreator(input, settings, [], [], evaluatedAt),
  };
}

function isManualDecision(source: EvaluatedCreator, history: HistoryRecord | null): boolean {
  return source.decisionSource === "manual"
    || Boolean(source.manualCorrection)
    || history?.decisionSource === "manual"
    || Boolean(history?.manualCorrection);
}

function copyManualDecision(source: EvaluatedCreator, history: HistoryRecord | null): EvaluatedCreator {
  if (!history) return source;
  return {
    ...source,
    identity: history.identity,
    decision: history.finalDecision,
    reasonCodes: [...history.reasonCodes],
    koreanExplanation: history.koreanExplanation,
    fitScore: history.fitScore,
    scoreComponents: history.scoreComponents ? { ...history.scoreComponents } : null,
    contactReady: history.contactReady ?? source.contactReady,
    ruleVersion: history.ruleVersion,
    recheckAt: history.recheckAt,
    appliedSettings: history.appliedSettings ? cloneSettings(history.appliedSettings) : null,
    decisionSource: "manual",
    manualCorrection: history.manualCorrection,
    evaluatedAt: history.updatedAt,
  };
}

function createEmptyDiagnostics(): AutomaticScoutingDiagnostics {
  return {
    funnel: emptyBreakdown(),
    querySequence: [],
    byCategory: {},
    byQuery: { reevaluation: emptyBreakdown() },
  };
}

function emptyBreakdown(): AutomaticScoutingDecisionBreakdown {
  return {
    evaluated: 0,
    staticEligible: 0,
    scoreQualified: 0,
    contactReady: 0,
    recommended: 0,
    hold: 0,
    excluded: 0,
  };
}

function recordDiagnostics(
  diagnostics: AutomaticScoutingDiagnostics,
  creator: EvaluatedCreator,
  recommendationThreshold: number,
): void {
  const category = creator.identity.category || "미분류";
  diagnostics.byCategory[category] ??= emptyBreakdown();
  for (const breakdown of [diagnostics.funnel, diagnostics.byCategory[category], diagnostics.byQuery.reevaluation]) {
    breakdown.evaluated += 1;
    if (!creator.reasonCodes.some(isPermanentHardExclusionReason)) breakdown.staticEligible += 1;
    if ((creator.fitScore ?? -1) >= recommendationThreshold) breakdown.scoreQualified += 1;
    if (creator.contactReady) breakdown.contactReady += 1;
    breakdown[creator.decision] += 1;
  }
}

function cloneSettings(settings: RecommendationSettings): RecommendationSettings {
  return {
    ...settings,
    allowedCategories: [...settings.allowedCategories],
    blockedChannelTypes: [...settings.blockedChannelTypes],
    excludedEmailClassifications: [...settings.excludedEmailClassifications],
    scoreWeights: { ...settings.scoreWeights },
  };
}
