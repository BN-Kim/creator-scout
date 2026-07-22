"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CreatorEvidencePanel } from "@/components/creator-evidence-panel";
import { CreatorTable } from "@/components/creator-table";
import { EmptyState } from "@/components/empty-state";
import { FilterControls } from "@/components/filter-controls";
import { PageHeader } from "@/components/page-header";
import { decisionLabels } from "@/config/labels";
import { defaultRecommendationSettings, recommendationSettingsSchema } from "@/config/recommendation-rules";
import { BrowserHistoryRepository } from "@/lib/browser-history-repository";
import { createInitialHistory, evaluateMockRun, MOCK_RUN_ID } from "@/lib/mock-run";
import { createHistoryRecord } from "@/server/history/history-record";
import { groupResults } from "@/server/output/group-results";
import type { CreatorDecision, EvaluatedCreator, ManualCorrection, ManualCorrectionCode, NewRunInput, RecommendationSettings } from "@/types/domain";

const decisionOrder: CreatorDecision[] = ["recommended", "hold", "excluded"];

export function RunDetailClient({ runId }: { runId: string }): React.ReactNode {
  const [decision, setDecision] = useState<CreatorDecision | "all">("all"); const [category, setCategory] = useState("all"); const [creators, setCreators] = useState<EvaluatedCreator[]>([]); const [selectedId, setSelectedId] = useState<string | null>(null); const [message, setMessage] = useState("");
  const effectiveRunId = runId === "mock-new-run" ? MOCK_RUN_ID : runId;
  const evaluateAndSave = useCallback((corrections: Record<string, ManualCorrection> = {}): void => {
    const repository = new BrowserHistoryRepository(window.localStorage);
    let history = repository.load();
    if (history.length === 0) { history = createInitialHistory(); repository.replace(history); }
    const storedCorrections = Object.fromEntries(history.filter((record) => record.scoutingRunId === effectiveRunId && record.manualCorrection).map((record) => [record.identity.internalId, record.manualCorrection as ManualCorrection]));
    let settings: RecommendationSettings = defaultRecommendationSettings;
    const savedSettings = window.localStorage.getItem("creator-recommendation-settings-v2");
    if (savedSettings) { try { settings = recommendationSettingsSchema.parse(JSON.parse(savedSettings) as unknown); } catch (error) { console.error("저장된 추천 설정을 적용하지 못했습니다.", error); } }
    const runInput = window.sessionStorage.getItem("mock-scouting-run-input");
    if (runInput) { try { const parsed = JSON.parse(runInput) as NewRunInput; settings = { ...settings, maximumDaysSinceLatestUpload: parsed.maximumDaysSinceLatestUpload, minimumRecentAverageViews: parsed.minimumRecentAverageViews, minimumRecentVideoCount: parsed.minimumRecentVideoCount, allowedCategories: [parsed.category] }; } catch (error) { console.error("추천 실행 입력값을 적용하지 못했습니다.", error); } }
    const previousRuns = history.filter((record) => record.scoutingRunId !== effectiveRunId);
    const evaluated = evaluateMockRun(previousRuns, { ...storedCorrections, ...corrections }, settings);
    for (const creator of evaluated) {
      if ((creator.historyMatch || creator.sameRunMatch) && !creator.manualCorrection) continue;
      repository.addOrUpdate(createHistoryRecord(creator, effectiveRunId));
    }
    setCreators(evaluated);
  }, [effectiveRunId]);
  useEffect(() => { evaluateAndSave(); }, [evaluateAndSave]);
  const selected = creators.find((creator) => creator.identity.internalId === selectedId) ?? null;
  const filtered = useMemo(() => creators.filter((creator) => (decision === "all" || creator.decision === decision) && (category === "all" || creator.identity.category === category)), [creators, decision, category]);
  const groups = useMemo(() => groupResults(filtered), [filtered]);
  const correct = (code: ManualCorrectionCode, note: string): void => {
    if (!selected) return;
    const correction: ManualCorrection = { code, note, correctedAt: new Date().toISOString() };
    const corrections = { [selected.identity.internalId]: correction };
    evaluateAndSave(corrections);
    setSelectedId(null); setMessage(`${selected.identity.channelName}을(를) 제외로 교정하고 히스토리에 반영했습니다.`);
  };
  return <><PageHeader title="2단계 목 추천 실행" description="결정론적 규칙이 근거를 평가하고 추천·보류·제외로 분류합니다." action={<FilterControls decision={decision} category={category} onDecisionChange={setDecision} onCategoryChange={setCategory} />} />{message && <div role="status" className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">{message}</div>}<div className="mb-5 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">24개 검증 시나리오는 모두 허구의 목 데이터입니다. 판정은 화면에 하드코딩하지 않고 규칙 엔진에서 계산합니다.</div><div className="space-y-6">{decisionOrder.map((groupDecision) => { if (decision !== "all" && decision !== groupDecision) return null; const group = groups[groupDecision]; return <section key={groupDecision} className="panel overflow-hidden"><div className="flex items-center gap-3 p-5"><h2 className="font-bold text-ink">{decisionLabels[groupDecision]}</h2><span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">{group.length}</span></div>{group.length ? <CreatorTable creators={group} onSelect={(creator) => setSelectedId(creator.identity.internalId)} /> : <div className="p-5 pt-0"><EmptyState title="조건에 맞는 크리에이터가 없습니다" description="필터를 변경해 다른 결과를 확인해 보세요." /></div>}</section>; })}</div><CreatorEvidencePanel creator={selected} onClose={() => setSelectedId(null)} onCorrect={correct} /></>;
}
