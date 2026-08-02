import type { EvaluatedCreator, HistoryRecord, HistoryStatus } from "@/types/domain";

export function toHistoryStatus(decision: EvaluatedCreator["decision"]): HistoryStatus { return decision === "hold" ? "candidate" : decision; }
export function createHistoryRecord(creator: EvaluatedCreator, scoutingRunId: string, existingCreatedAt?: string): HistoryRecord {
  return {
    id: `history-${creator.identity.internalId}`,
    identity: creator.identity,
    historyStatus: toHistoryStatus(creator.decision),
    finalDecision: creator.decision,
    category: creator.identity.category,
    reasonCodes: creator.reasonCodes,
    koreanExplanation: creator.koreanExplanation,
    evidenceSummary: `검증 ${creator.evidence.verifiedAt} · 적합도 ${creator.fitScore === null ? "미산정" : `${creator.fitScore}점`} · 최근 영상 ${creator.evidence.recentVideoCount ?? "미확인"}개 · 최근 평균 조회 ${creator.evidence.recentAverageViews ?? "미확인"}`,
    scoutingRunId,
    createdAt: existingCreatedAt ?? creator.evaluatedAt,
    updatedAt: creator.evaluatedAt,
    manualCorrection: creator.manualCorrection ?? null,
    fitScore: creator.fitScore,
    scoreComponents: creator.scoreComponents,
    contactReady: creator.contactReady,
    ruleVersion: creator.ruleVersion,
    recheckAt: creator.recheckAt,
    appliedSettings: creator.appliedSettings,
    decisionSource: creator.decisionSource,
  };
}
