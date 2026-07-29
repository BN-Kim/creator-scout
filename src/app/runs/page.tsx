"use client";

import { LiveScoutingRunTable } from "@/components/live-scouting-run-table";
import { PageHeader } from "@/components/page-header";
import { useOperationsSnapshot } from "@/lib/use-operations-snapshot";

export default function RunsPage(): React.ReactNode {
  const { data, error } = useOperationsSnapshot();
  return <>
    <PageHeader title="추천 실행 기록" description="실제 자동 추천 실행의 진행 상태와 결과를 한국시간 기준으로 확인합니다." />
    {error && <p role="alert" className="mb-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}
    <section className="panel overflow-hidden">
      <div className="border-b border-slate-200 px-5 py-4">
        <h2 className="text-lg font-bold text-ink">전체 실행</h2>
        <p className="mt-1 text-sm text-slate-500">실행 중인 작업을 포함해 3초마다 자동 갱신합니다.</p>
      </div>
      {data
        ? <LiveScoutingRunTable executions={data.executions} events={data.events} />
        : <p className="p-6 text-sm text-slate-500">추천 실행 기록을 불러오는 중입니다.</p>}
    </section>
  </>;
}
