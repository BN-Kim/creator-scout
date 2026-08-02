import { randomUUID } from "node:crypto";
import { isPermanentHardExclusionReason } from "@/config/recommendation-rules";
import { normalizeDiscoveryQuery } from "@/server/discovery/discovery-taxonomy";
import { toHistoryStatus } from "@/server/history/history-record";
import type { HistoryRepository } from "@/server/history/history-repository";
import { SqliteDecisionAuditRepository } from "@/server/history/sqlite-decision-audit-repository";
import { SqliteHistoryRepository } from "@/server/history/sqlite-history-repository";
import { openDatabase, type SqliteDatabase } from "@/server/database/database";
import type {
  AutomaticScoutingDecisionBreakdown,
  AutomaticScoutingDiagnostics,
  AutomaticScoutingRunResult,
} from "@/server/scouting/automatic-scouting-types";
import { SqliteAutomaticRunResultRepository } from "@/server/scouting/sqlite-automatic-run-result-repository";
import type {
  CreatorDecision,
  EvaluatedCreator,
  ManualDecisionAudit,
  ManualDecisionReason,
} from "@/types/domain";

interface RunRepository {
  get(runId: string): AutomaticScoutingRunResult | null;
  save(result: AutomaticScoutingRunResult): void;
}

interface DecisionAuditRepository {
  add(record: ManualDecisionAudit): void;
  list(filters?: { runId?: string; creatorInternalId?: string; historyRecordId?: string }): ManualDecisionAudit[];
}

export interface ManualDecisionDependencies {
  historyRepository: HistoryRepository;
  runRepository: RunRepository;
  auditRepository: DecisionAuditRepository;
  now?: () => Date;
  createId?: () => string;
}

export interface ApplyManualDecisionRequest {
  runId: string;
  creatorInternalId: string;
  decision: CreatorDecision;
  reason: ManualDecisionReason;
  note: string;
  actor?: string;
}

export interface ApplyManualDecisionResult {
  creator: EvaluatedCreator;
  audit: ManualDecisionAudit;
  run: AutomaticScoutingRunResult;
}

export function applyManualDecision(
  request: ApplyManualDecisionRequest,
  dependencies: ManualDecisionDependencies,
): ApplyManualDecisionResult {
  const run = dependencies.runRepository.get(request.runId);
  if (!run) throw new ManualDecisionError("run_not_found");
  const creator = run.results.find((candidate) => candidate.identity.internalId === request.creatorInternalId);
  if (!creator) throw new ManualDecisionError("creator_not_found");
  if (creator.decision === request.decision) throw new ManualDecisionError("unchanged");
  const permanentHard = creator.reasonCodes.some(isPermanentHardExclusionReason);
  if (permanentHard && request.decision !== "excluded") throw new ManualDecisionError("hard_exclusion_locked");
  if (request.decision === "recommended" && !creator.contactReady) {
    throw new ManualDecisionError("contact_not_ready");
  }

  const now = (dependencies.now ?? (() => new Date()))();
  const history = dependencies.historyRepository.findDuplicate(creator.identity);
  if (!history) throw new ManualDecisionError("history_not_found");
  const reasonLabel = manualDecisionReasonLabels[request.reason];
  const note = request.note.trim();
  const explanation = `마케터 수동 판정: ${reasonLabel}.${note ? ` ${note}` : ""}`;
  const updatedCreator: EvaluatedCreator = {
    ...creator,
    decision: request.decision,
    decisionSource: "manual",
    reasonCodes: [...new Set([...creator.reasonCodes, "manual_decision_override" as const])],
    koreanExplanation: explanation,
    recheckAt: null,
    evaluatedAt: now.toISOString(),
  };
  const updatedRun = rebuildRun({
    ...run,
    results: run.results.map((candidate) =>
      candidate.identity.internalId === request.creatorInternalId ? updatedCreator : candidate),
  });
  const updatedHistory = {
    ...history,
    historyStatus: toHistoryStatus(request.decision),
    finalDecision: request.decision,
    reasonCodes: updatedCreator.reasonCodes,
    koreanExplanation: explanation,
    scoutingRunId: request.runId,
    updatedAt: now.toISOString(),
    recheckAt: null,
    decisionSource: "manual" as const,
  };
  const audit: ManualDecisionAudit = {
    id: `decision-audit-${(dependencies.createId ?? randomUUID)()}`,
    historyRecordId: history.id,
    runId: request.runId,
    creatorInternalId: request.creatorInternalId,
    previousDecision: creator.decision,
    nextDecision: request.decision,
    reason: request.reason,
    note,
    actor: request.actor?.trim() || "local_marketer",
    changedAt: now.toISOString(),
  };

  dependencies.historyRepository.addOrUpdate(updatedHistory);
  dependencies.auditRepository.add(audit);
  dependencies.runRepository.save(updatedRun);
  return { creator: updatedCreator, audit, run: updatedRun };
}

export const manualDecisionReasonLabels: Record<ManualDecisionReason, string> = {
  marketer_fit: "캠페인 적합성 재판단",
  contact_verified: "연락 가능성 확인",
  campaign_mismatch: "캠페인 방향 불일치",
  insufficient_evidence: "근거 추가 확인 필요",
  do_not_contact: "연락 제외 대상",
  duplicate_or_invalid: "중복 또는 무효 후보",
  other: "기타 운영 판단",
};

export class ManualDecisionError extends Error {
  constructor(public readonly reason:
    | "run_not_found"
    | "creator_not_found"
    | "history_not_found"
    | "unchanged"
    | "hard_exclusion_locked"
    | "contact_not_ready") {
    super(manualDecisionErrorMessage(reason));
    this.name = "ManualDecisionError";
  }
}

export function createServerManualDecisionDependencies(): ManualDecisionDependencies & { database: SqliteDatabase } {
  const database = getManualDecisionDatabase();
  return {
    database,
    historyRepository: new SqliteHistoryRepository(database),
    runRepository: new SqliteAutomaticRunResultRepository(database),
    auditRepository: new SqliteDecisionAuditRepository(database),
  };
}

const globalManualDecision = globalThis as typeof globalThis & { creatorManualDecisionDatabase?: SqliteDatabase };

function getManualDecisionDatabase(): SqliteDatabase {
  globalManualDecision.creatorManualDecisionDatabase ??= openDatabase();
  return globalManualDecision.creatorManualDecisionDatabase;
}

function rebuildRun(run: AutomaticScoutingRunResult): AutomaticScoutingRunResult {
  const recommended = run.results.filter((creator) => creator.decision === "recommended").length;
  const hold = run.results.filter((creator) => creator.decision === "hold").length;
  const excluded = run.results.filter((creator) => creator.decision === "excluded").length;
  return {
    ...run,
    statistics: {
      ...run.statistics,
      recommended,
      hold,
      excluded,
      recommendationsFilled: recommended,
    },
    diagnostics: rebuildDiagnostics(run),
  };
}

function rebuildDiagnostics(run: AutomaticScoutingRunResult): AutomaticScoutingDiagnostics {
  const diagnostics: AutomaticScoutingDiagnostics = {
    funnel: emptyBreakdown(),
    querySequence: [...run.diagnostics.querySequence],
    byCategory: {},
    byQuery: {},
  };
  const threshold = run.requestSnapshot?.settings.recommendationScoreThreshold ?? 70;
  for (const creator of run.results) {
    const category = creator.identity.category || "미분류";
    const queryKey = sourceQueryKey(creator, run.runKind);
    diagnostics.byCategory[category] ??= emptyBreakdown();
    diagnostics.byQuery[queryKey] ??= emptyBreakdown();
    for (const breakdown of [diagnostics.funnel, diagnostics.byCategory[category], diagnostics.byQuery[queryKey]]) {
      breakdown.evaluated += 1;
      if (!creator.reasonCodes.some(isPermanentHardExclusionReason)) breakdown.staticEligible += 1;
      if ((creator.fitScore ?? -1) >= threshold) breakdown.scoreQualified += 1;
      if (creator.contactReady) breakdown.contactReady += 1;
      breakdown[creator.decision] += 1;
    }
  }
  return diagnostics;
}

function sourceQueryKey(creator: EvaluatedCreator, runKind: AutomaticScoutingRunResult["runKind"]): string {
  if (runKind === "reevaluation") return "reevaluation";
  const prefix = "youtube_provider:";
  return creator.mockScenario.startsWith(prefix)
    ? normalizeDiscoveryQuery(creator.mockScenario.slice(prefix.length))
    : "unknown";
}

function emptyBreakdown(): AutomaticScoutingDecisionBreakdown {
  return { evaluated: 0, staticEligible: 0, scoreQualified: 0, contactReady: 0, recommended: 0, hold: 0, excluded: 0 };
}

function manualDecisionErrorMessage(reason: ManualDecisionError["reason"]): string {
  const messages: Record<ManualDecisionError["reason"], string> = {
    run_not_found: "실행 결과를 찾을 수 없습니다.",
    creator_not_found: "실행에서 크리에이터를 찾을 수 없습니다.",
    history_not_found: "크리에이터 히스토리를 찾을 수 없습니다.",
    unchanged: "현재 판정과 동일합니다.",
    hard_exclusion_locked: "비협상 제외 근거가 있어 보류나 추천으로 변경할 수 없습니다.",
    contact_not_ready: "확인된 개인 연락처가 없어 추천으로 변경할 수 없습니다.",
  };
  return messages[reason];
}
