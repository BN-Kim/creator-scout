import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { formatDate, formatNumber } from "@/lib/format";
import { formatHistoryReasonLines } from "@/lib/history-presentation";
import type { DiscoveryMode } from "@/server/discovery/discovery-types";
import { groupResults } from "@/server/output/group-results";
import type { AutomaticScoutingRunResult, AutomaticScoutingStopReason } from "@/server/scouting/automatic-scouting-types";
import type { CreatorDecision, EvaluatedCreator } from "@/types/domain";
import { ReevaluateRunButton } from "./reevaluate-run-button";
import { ManualDecisionControls } from "./manual-decision-controls";
import { isPermanentHardExclusionReason } from "@/config/recommendation-rules";

const groupLabels: Record<CreatorDecision, string> = { recommended: "추천", hold: "보류", excluded: "제외" };
const discoveryModeLabels: Record<DiscoveryMode, string> = { automatic: "자동 검색어만", manual_replace: "추가 검색어만", manual_extend: "자동 검색어 + 추가 검색어" };
const stopReasonLabels: Record<AutomaticScoutingStopReason, string> = {
  target_reached: "스카우팅 목표를 모두 충족했습니다.",
  source_exhausted: "사용 가능한 발견 소스를 모두 확인해 부분 완료했습니다.",
  candidate_limit_reached: "후보 확인 한도에 도달해 부분 완료했습니다.",
  page_limit_reached: "발견 페이지 한도에 도달해 부분 완료했습니다.",
  time_limit_reached: "실행 시간 한도에 도달해 부분 완료했습니다.",
  provider_failure_limit_reached: "공급자 실패 한도에 도달해 부분 완료했습니다.",
};
const failureCategoryLabels: Readonly<Record<string, string>> = {
  configuration: "공급자 설정 오류",
  quota_exceeded: "YouTube 일일 검색 할당량 소진",
  rate_limited: "YouTube 요청 속도 제한",
  unauthorized: "YouTube API 인증 오류",
  timeout: "공급자 응답 시간 초과",
  temporary: "공급자 일시 오류",
  response_invalid: "공급자 응답 형식 오류",
  evidence_unavailable: "검증 근거 미제공",
  provider_incompatible: "공급자 호환성 오류",
  storage: "히스토리 저장 오류",
  internal: "내부 처리 오류",
};

export function AutomaticRunResult({ run }: { run: AutomaticScoutingRunResult }): React.ReactNode {
  const groups = groupResults(run.results);
  const stats: ReadonlyArray<readonly [string, string | number]> = [
    ["스카우팅 목표", run.statistics.targetRecommendedCount],
    ["발견", run.statistics.discovered],
    ["추천", run.statistics.recommended],
    ["보류", run.statistics.hold],
    ["제외", run.statistics.excluded],
    ["중복", run.statistics.priorHistorySkipped + run.statistics.sameRunDuplicatesSkipped],
    ["실패", run.statistics.failed],
  ];
  return <>
    <PageHeader
      title={run.runKind === "reevaluation" ? "저장 근거 재평가" : "자동 스카우트 실행"}
      description={run.runKind === "reevaluation"
        ? "YouTube API를 다시 호출하지 않고 저장된 근거를 현재 추천 규칙으로 재판정했습니다."
        : "스카우팅 목표를 채울 때까지 여러 검색어와 다음 페이지를 순환하며 새 후보를 검증합니다."}
      action={run.runKind === "discovery" ? <ReevaluateRunButton sourceRunId={run.runId} /> : undefined}
    />
    <div role="status" className={`mb-5 rounded-xl border px-4 py-3 text-sm ${run.statistics.stopReason === "target_reached" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
      <strong>{run.statistics.recommendationsFilled} / {run.statistics.targetRecommendedCount}명 충족</strong><span className="ml-2">{stopReasonLabels[run.statistics.stopReason]}</span>
    </div>
    {run.runKind === "reevaluation" && <div className="mb-5 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
      원본 실행 <strong>{run.sourceRunId}</strong> · 자동 재평가 {run.statistics.historyReevaluated}건 · 보존된 수동 판정 {run.statistics.manualOverrideSkipped}건 · 규칙 {run.requestSnapshot?.ruleVersion ?? "미확인"}
    </div>}
    <section aria-label="실행 통계" className="mb-7">
      <div className="mb-3 flex items-center gap-2 text-sm">
        <span className="text-xs font-semibold text-slate-500">검색 모드</span>
        <strong className="font-semibold text-ink">{discoveryModeLabels[run.statistics.discoveryMode]}</strong>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">
        {stats.map(([label, value]) => <div className="panel min-w-0 p-4" key={label} data-statistic-card><p className="text-xs font-semibold text-slate-500" data-statistic-label>{label}</p><p className="mt-2 break-words text-2xl font-bold text-ink">{typeof value === "number" ? formatNumber(value) : value}</p></div>)}
      </div>
    </section>
    <section className="panel mb-7 overflow-hidden" aria-label="추천 퍼널과 검색 순서">
      <div className="border-b border-slate-200 px-5 py-4"><h2 className="font-bold text-ink">이번 실행 진단</h2></div>
      <div className="grid gap-3 p-5 sm:grid-cols-3 lg:grid-cols-6">
        {([[
          "평가", run.diagnostics.funnel.evaluated,
        ], ["정적 적격", run.diagnostics.funnel.staticEligible], ["70점 이상", run.diagnostics.funnel.scoreQualified], ["연락 준비", run.diagnostics.funnel.contactReady], ["추천", run.diagnostics.funnel.recommended], ["보류", run.diagnostics.funnel.hold]] as const).map(([label, value]) => <div key={label} className="rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-lg font-bold text-ink">{formatNumber(value)}</p></div>)}
      </div>
      <div className="border-t border-slate-200 px-5 py-4">
        <p className="text-xs font-semibold text-slate-500">검색어 순서</p>
        {run.diagnostics.querySequence.length === 0
          ? <p className="mt-2 text-sm text-slate-500">재평가 실행은 새 검색을 사용하지 않습니다.</p>
          : <ol className="mt-2 flex flex-wrap gap-2">{run.diagnostics.querySequence.map((attempt) => <li key={`${attempt.order}-${attempt.normalizedKey}`} className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">{attempt.order}. {attempt.query} · {attempt.strategy === "recent_video" ? "최근 영상" : "채널"}</li>)}</ol>}
      </div>
    </section>
    {run.results.length === 0
      ? <EmptyState title="새로 처리된 결과가 없습니다" description="중복 또는 공급자 실패로 판정과 히스토리가 생성되지 않았습니다." />
      : <div className="space-y-6">{(["recommended", "hold", "excluded"] as const).map((decision) => <ResultGroup key={decision} runId={run.runId} decision={decision} creators={groups[decision]} />)}</div>}
    {run.failures.length > 0 && <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
      <p>처리 실패 {run.failures.length}건은 스카우팅 목표에 포함되지 않습니다.</p>
      <p className="mt-1 font-medium">{failureSummary(run)}</p>
    </div>}
  </>;
}

function failureSummary(run: AutomaticScoutingRunResult): string {
  const counts = new Map<string, number>();
  for (const failure of run.failures) counts.set(failure.category, (counts.get(failure.category) ?? 0) + 1);
  return [...counts.entries()]
    .map(([category, count]) => `${failureCategoryLabels[category] ?? "기타 공급자 오류"} ${count}건`)
    .join(" · ");
}

function ResultGroup({ runId, decision, creators }: { runId: string; decision: CreatorDecision; creators: EvaluatedCreator[] }): React.ReactNode {
  return <section className="panel overflow-hidden" data-result-group={decision}>
    <div className="flex items-center justify-between border-b border-slate-200 px-4 py-4 sm:px-6"><h2 className="text-lg font-bold text-ink">{groupLabels[decision]}</h2><span className="text-sm text-slate-500">{creators.length}명</span></div>
    {creators.length === 0 ? <p className="px-6 py-8 text-sm text-slate-500">해당 판정의 신규 결과가 없습니다.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[1280px] text-left text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="px-5 py-3">채널명</th><th className="px-5 py-3">카테고리</th><th className="px-5 py-3">적합도</th><th className="px-5 py-3">연락</th><th className="px-5 py-3">기간 내 최근 영상 수</th><th className="px-5 py-3">최근 평균 조회수</th><th className="px-5 py-3">최근 업로드</th><th className="px-5 py-3">판정</th><th className="px-5 py-3">판정 사유</th><th className="px-5 py-3">운영</th></tr></thead><tbody className="divide-y divide-slate-100">{creators.map((creator) => <tr key={creator.identity.internalId}><td className="px-5 py-4 font-semibold text-ink"><a className="focus-ring rounded text-brand hover:underline" href={creator.identity.canonicalChannelUrl ?? "#"} target="_blank" rel="noreferrer">{creator.identity.channelName}</a></td><td className="px-5 py-4">{creator.identity.category}</td><td className="px-5 py-4 font-semibold">{creator.fitScore === null ? "미산정" : `${creator.fitScore}점`}</td><td className="px-5 py-4">{creator.contactReady ? "확인" : "미확인"}</td><td className="px-5 py-4">{creator.evidence.recentVideoCount === null ? "미확인" : `${formatNumber(creator.evidence.recentVideoCount)}개`}</td><td className="px-5 py-4">{creator.evidence.recentAverageViews === null ? "미확인" : formatNumber(creator.evidence.recentAverageViews)}</td><td className="px-5 py-4">{creator.evidence.latestUploadDate ? formatDate(creator.evidence.latestUploadDate) : "미확인"}</td><td className="px-5 py-4"><StatusBadge status={creator.decision} />{creator.decisionSource === "manual" && <span className="mt-1 block text-[11px] font-semibold text-blue-600">수동 판정</span>}</td><td className="max-w-sm px-5 py-4 text-slate-600"><div className="space-y-1" data-decision-reasons>{formatHistoryReasonLines(creator.koreanExplanation, creator.reasonCodes, creator.decision).map((reason, index) => <p key={`${creator.identity.internalId}-${index}`}>{reason}</p>)}</div></td><td className="px-5 py-4 align-top"><ManualDecisionControls runId={runId} creatorInternalId={creator.identity.internalId} currentDecision={creator.decision} contactReady={creator.contactReady} hardLocked={creator.reasonCodes.some(isPermanentHardExclusionReason)} /></td></tr>)}</tbody></table></div>}
    </section>;
}
