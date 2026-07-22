import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { formatNumber } from "@/lib/format";
import { groupResults } from "@/server/output/group-results";
import type { AutomaticScoutingRunResult } from "@/server/scouting/automatic-scouting-types";
import type { CreatorDecision, EvaluatedCreator } from "@/types/domain";

const groupLabels: Record<CreatorDecision, string> = { recommended: "추천", hold: "보류", excluded: "제외" };

export function AutomaticRunResult({ run }: { run: AutomaticScoutingRunResult }): React.ReactNode {
  const groups = groupResults(run.results);
  const stats = [
    ["발견", run.statistics.discovered],
    ["중복 건너뜀", run.statistics.skippedDuplicates],
    ["평가", run.statistics.evaluated],
    ["추천", run.statistics.recommended],
    ["보류", run.statistics.hold],
    ["제외", run.statistics.excluded],
    ["실패", run.statistics.failed],
  ] as const;
  return <>
    <PageHeader title="자동 목 스카우팅 실행" description="H4 파이프라인을 허구 공급자 응답으로 실행한 결과입니다. 과거·동일 실행 중복은 결과에서 제외됩니다." />
    <section aria-label="실행 통계" className="mb-7 grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">
      {stats.map(([label, value]) => <div className="panel p-4" key={label}><p className="text-xs font-semibold text-slate-500">{label}</p><p className="mt-2 text-2xl font-bold text-ink">{formatNumber(value)}</p></div>)}
    </section>
    {run.results.length === 0
      ? <EmptyState title="새로 처리된 결과가 없습니다" description="발견한 채널이 모두 과거 또는 동일 실행 중복이어서 새 판정과 히스토리를 만들지 않았습니다." />
      : <div className="space-y-6">{(["recommended", "hold", "excluded"] as const).map((decision) => <ResultGroup key={decision} decision={decision} creators={groups[decision]} />)}</div>}
    {run.failures.length > 0 && <p role="status" className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">후보 {run.failures.length}개의 처리 실패를 격리하고 나머지 후보 처리를 완료했습니다.</p>}
  </>;
}

function ResultGroup({ decision, creators }: { decision: CreatorDecision; creators: EvaluatedCreator[] }): React.ReactNode {
  return <section className="panel overflow-hidden" data-result-group={decision}>
    <div className="flex items-center justify-between border-b border-slate-200 px-4 py-4 sm:px-6"><h2 className="text-lg font-bold text-ink">{groupLabels[decision]}</h2><span className="text-sm text-slate-500">{creators.length}명</span></div>
    {creators.length === 0 ? <p className="px-6 py-8 text-sm text-slate-500">해당 판정의 신규 결과가 없습니다.</p> : <div className="overflow-x-auto"><table className="min-w-[720px] w-full text-left text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="px-5 py-3">채널명</th><th className="px-5 py-3">카테고리</th><th className="px-5 py-3">최근 평균 조회수</th><th className="px-5 py-3">판정</th><th className="px-5 py-3">판정 사유</th></tr></thead><tbody className="divide-y divide-slate-100">{creators.map((creator) => <tr key={creator.identity.internalId}><td className="px-5 py-4 font-semibold text-ink"><a className="focus-ring rounded text-brand hover:underline" href={creator.identity.canonicalChannelUrl ?? "#"} target="_blank" rel="noreferrer">{creator.identity.channelName}</a></td><td className="px-5 py-4">{creator.identity.category}</td><td className="px-5 py-4">{creator.evidence.recentAverageViews === null ? "미확인" : formatNumber(creator.evidence.recentAverageViews)}</td><td className="px-5 py-4"><StatusBadge status={creator.decision} /></td><td className="max-w-sm px-5 py-4 text-slate-600">{creator.koreanExplanation}</td></tr>)}</tbody></table></div>}
  </section>;
}
