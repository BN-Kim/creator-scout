"use client";

import { LiveScoutingRunTable } from "@/components/live-scouting-run-table";
import { PageHeader } from "@/components/page-header";
import { useOperationsSnapshot } from "@/lib/use-operations-snapshot";

export default function RunsPage(): React.ReactNode {
  const { data, error } = useOperationsSnapshot();
  return <>
    <PageHeader title="스카우트 기록" description="실제 자동 스카우트의 진행 상태와 결과를 한국시간 기준으로 확인합니다." />
    {error && <p role="alert" className="mb-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}
    <section className="panel overflow-hidden">
      <div className="border-b border-slate-200 px-5 py-4">
        <h2 className="text-lg font-bold text-ink">전체 실행</h2>
      </div>
      {data
        ? <LiveScoutingRunTable
            executions={data.executions}
            events={data.events}
            availableRunIds={data.availableRunIds}
          />
        : <p className="p-6 text-sm text-slate-500">스카우트 기록을 불러오는 중입니다.</p>}
    </section>
  </>;
}
