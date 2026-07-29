"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/icons";
import { LiveScoutingRunTable } from "@/components/live-scouting-run-table";
import { PageHeader } from "@/components/page-header";
import { SummaryCard } from "@/components/summary-card";
import { isKoreanCalendarDate } from "@/lib/format";
import { subscribeToOperationsChanged } from "@/lib/operations-refresh";
import { useOperationsSnapshot } from "@/lib/use-operations-snapshot";
import type { HistoryRecord } from "@/types/domain";

export default function DashboardPage(): React.ReactNode {
  const operations = useOperationsSnapshot();
  const [history, setHistory] = useState<HistoryRecord[]>([]);
  const [historyError, setHistoryError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const refresh = async (): Promise<void> => {
      try {
        const response = await fetch("/api/history", { cache: "no-store" });
        if (!response.ok) throw new Error("판정 히스토리를 불러오지 못했습니다.");
        const records = await response.json() as HistoryRecord[];
        if (active) {
          setHistory(records);
          setHistoryError(null);
        }
      } catch (cause: unknown) {
        if (active) setHistoryError(cause instanceof Error ? cause.message : "판정 히스토리를 불러오지 못했습니다.");
      }
    };
    void refresh();
    const unsubscribe = subscribeToOperationsChanged(() => { void refresh(); });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const today = useMemo(() => history.filter((record) => isKoreanCalendarDate(record.updatedAt, new Date())), [history]);
  const counts = {
    recommended: today.filter((record) => record.finalDecision === "recommended").length,
    hold: today.filter((record) => record.finalDecision === "hold").length,
    excluded: today.filter((record) => record.finalDecision === "excluded").length,
  };
  const error = operations.error ?? historyError;

  return <>
    <PageHeader
      title="대시보드"
      description="실제 추천 실행과 SQLite 판정 기록을 한국시간 기준으로 추적합니다."
      action={<Link href="/runs/new" className="button-primary"><Icon name="plus" className="h-4 w-4" />새 추천 실행</Link>}
    />
    {error && <p role="alert" className="mb-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="오늘의 실시간 판정 요약">
      <SummaryCard label="오늘 처리" value={today.length} note="오늘 KST 기준 확정 판정" />
      <SummaryCard label="오늘 추천" value={counts.recommended} note="추천 조건 전체 통과" tone="emerald" />
      <SummaryCard label="오늘 보류" value={counts.hold} note="추가 근거 확인 필요" tone="amber" />
      <SummaryCard label="오늘 제외" value={counts.excluded} note="하드 제외 조건 충족" tone="rose" />
    </section>
    <section className="panel mt-7 overflow-hidden">
      <div className="flex flex-col gap-2 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <h2 className="text-lg font-bold text-ink">실행 히스토리</h2>
        <Link href="/runs" className="text-sm font-semibold text-brand hover:underline">전체 실행 히스토리 보기</Link>
      </div>
      {operations.data
        ? <LiveScoutingRunTable
            executions={operations.data.executions.slice(0, 8)}
            events={operations.data.events}
            availableRunIds={operations.data.availableRunIds}
          />
        : <p className="p-6 text-sm text-slate-500">실행 기록을 불러오는 중입니다.</p>}
    </section>
  </>;
}
