import { PageHeader } from "@/components/page-header";
import { formatNumber } from "@/lib/format";
import {
  createMarketingDiagnosticsReport,
  outcomeTypes,
  type MarketingDiagnosticsReport,
} from "@/server/marketing/marketing-diagnostics";
import type { AutomaticScoutingDecisionBreakdown } from "@/server/scouting/automatic-scouting-types";
import type { MarketingOutcomeType } from "@/types/domain";

export const dynamic = "force-dynamic";

const outcomeLabels: Record<MarketingOutcomeType, string> = {
  marketer_approved: "마케터 승인",
  contact_attempted: "연락 시도",
  replied: "회신",
  meeting: "미팅",
  contracted: "계약",
  content_published: "콘텐츠 발행",
  campaign_performance: "성과 입력",
};

export default function InsightsPage(): React.ReactNode {
  const report = createMarketingDiagnosticsReport();
  return <>
    <PageHeader title="추천 진단" description="규칙 버전·카테고리·검색어별 추천 퍼널과 실제 마케팅 후속 결과를 비교합니다." />
    <section className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Metric label="저장 실행" value={report.runCount} detail={`탐색 ${report.discoveryRunCount} · 재평가 ${report.reevaluationRunCount}`} />
      <Metric label="평가 후보" value={report.overall.evaluated} detail={`정적 적격 ${report.overall.staticEligible}`} />
      <Metric label="추천 / 보류" value={`${report.overall.recommended} / ${report.overall.hold}`} detail={`연락 준비 ${report.overall.contactReady}`} />
      <Metric label="수동 판정" value={report.manualDecisionCount} detail="감사 이력 누적" />
    </section>
    <section className="panel mb-6 overflow-hidden">
      <div className="border-b border-slate-200 px-5 py-4"><h2 className="font-bold text-ink">마케팅 후속 퍼널</h2></div>
      <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-4">
        {outcomeTypes.map((type) => <Metric key={type} label={outcomeLabels[type]} value={report.outcomeFunnel[type].creators} detail={`이벤트 ${report.outcomeFunnel[type].events}건`} />)}
      </div>
      <div className="border-t border-slate-200 px-5 py-4 text-sm text-slate-600">캠페인 합계 · 조회 {formatNumber(report.campaignTotals.views)} · 전환 {formatNumber(report.campaignTotals.conversions)} · 매출 {formatNumber(report.campaignTotals.revenueKrw)}원</div>
    </section>
    <BreakdownTable title="규칙 버전별 퍼널" rows={report.byRuleVersion} />
    <div className="mt-6 grid gap-6 xl:grid-cols-2">
      <BreakdownTable title="카테고리별 퍼널" rows={report.byCategory} />
      <BreakdownTable title="검색어별 퍼널" rows={report.byQuery} maxRows={20} />
    </div>
  </>;
}

function Metric({ label, value, detail }: { label: string; value: string | number; detail: string }): React.ReactNode {
  return <div className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs font-semibold text-slate-500">{label}</p><p className="mt-2 text-2xl font-bold text-ink">{typeof value === "number" ? formatNumber(value) : value}</p><p className="mt-1 text-xs text-slate-500">{detail}</p></div>;
}

function BreakdownTable({ title, rows, maxRows = 50 }: { title: string; rows: MarketingDiagnosticsReport["byQuery"]; maxRows?: number }): React.ReactNode {
  const entries = Object.entries(rows).sort((left, right) => right[1].evaluated - left[1].evaluated).slice(0, maxRows);
  return <section className="panel overflow-hidden">
    <div className="border-b border-slate-200 px-5 py-4"><h2 className="font-bold text-ink">{title}</h2></div>
    {entries.length === 0 ? <p className="p-5 text-sm text-slate-500">아직 집계할 실행 데이터가 없습니다.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="px-4 py-3">구분</th><th className="px-4 py-3">평가</th><th className="px-4 py-3">정적 적격</th><th className="px-4 py-3">점수 통과</th><th className="px-4 py-3">연락 준비</th><th className="px-4 py-3">추천</th><th className="px-4 py-3">보류</th><th className="px-4 py-3">제외</th></tr></thead><tbody className="divide-y divide-slate-100">{entries.map(([label, row]) => <BreakdownRow key={label} label={label} row={row} />)}</tbody></table></div>}
  </section>;
}

function BreakdownRow({ label, row }: { label: string; row: AutomaticScoutingDecisionBreakdown }): React.ReactNode {
  return <tr><td className="max-w-64 break-words px-4 py-3 font-medium text-ink">{label}</td>{(["evaluated", "staticEligible", "scoreQualified", "contactReady", "recommended", "hold", "excluded"] as const).map((key) => <td key={key} className="px-4 py-3 text-slate-600">{formatNumber(row[key])}</td>)}</tr>;
}
