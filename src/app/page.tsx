import Link from "next/link";
import { Icon } from "@/components/icons";
import { PageHeader } from "@/components/page-header";
import { ScoutingRunTable } from "@/components/scouting-run-table";
import { SummaryCard } from "@/components/summary-card";
import { mockScoutingRuns } from "@/data/scouting-runs";
import { createInitialHistory, evaluateMockRun } from "@/lib/mock-run";

export default function DashboardPage(): React.ReactNode {
  const evaluated = evaluateMockRun(createInitialHistory());
  const counts = { recommended: evaluated.filter((creator) => creator.decision === "recommended").length, hold: evaluated.filter((creator) => creator.decision === "hold").length, excluded: evaluated.filter((creator) => creator.decision === "excluded").length };
  return <><PageHeader title="대시보드" description="오늘의 크리에이터 평가 결과와 최근 추천 실행을 확인하세요." action={<Link href="/runs/new" className="button-primary"><Icon name="plus" className="h-4 w-4" />새 추천 실행</Link>} /><section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="오늘의 요약"><SummaryCard label="전체 검토" value={evaluated.length} note="결정론적 목 평가 결과" /><SummaryCard label="추천" value={counts.recommended} note="필수 조건 전체 통과" tone="emerald" /><SummaryCard label="보류" value={counts.hold} note="추가 검증 필요" tone="amber" /><SummaryCard label="제외" value={counts.excluded} note="제외 조건 또는 중복 확인" tone="rose" /></section><section className="panel mt-7 overflow-hidden"><div className="flex items-center justify-between p-5 sm:p-6"><div><h2 className="text-lg font-bold text-ink">최근 스카우팅 실행</h2><p className="mt-1 text-sm text-slate-500">최근 생성된 실행의 처리 현황입니다.</p></div></div><ScoutingRunTable runs={mockScoutingRuns} /></section></>;
}
