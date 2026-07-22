import { defaultRecommendationSettings } from "@/config/recommendation-rules";
import { initialMockHistoryCreator, mockCreatorInputs } from "@/data/creators";
import { createHistoryRecord } from "@/server/history/history-record";
import { evaluateCreator } from "@/server/rules/evaluate-creator";
import type { CreatorIdentity, EvaluatedCreator, HistoryRecord, ManualCorrection, RecommendationSettings } from "@/types/domain";

export const MOCK_RUN_ID = "mock-phase-2-run";

export function createInitialHistory(): HistoryRecord[] {
  const evaluated = evaluateCreator(initialMockHistoryCreator, defaultRecommendationSettings, [], [], new Date("2026-07-21T06:00:00.000Z"));
  const creator: EvaluatedCreator = { ...initialMockHistoryCreator, ...evaluated };
  return [createHistoryRecord(creator, "mock-previous-run")];
}

export function evaluateMockRun(history: HistoryRecord[], corrections: Record<string, ManualCorrection> = {}, settings: RecommendationSettings = defaultRecommendationSettings): EvaluatedCreator[] {
  const seen: CreatorIdentity[] = [];
  return mockCreatorInputs.map((original) => {
    const input = corrections[original.identity.internalId] ? { ...original, manualCorrection: corrections[original.identity.internalId] } : original;
    const result = evaluateCreator(input, settings, history, seen, new Date("2026-07-22T07:00:00.000Z"));
    seen.push(input.identity);
    return { ...input, ...result };
  });
}
