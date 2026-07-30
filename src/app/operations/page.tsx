"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { formatDateTime, formatNumber } from "@/lib/format";
import type {
  OperationMonitoringSnapshot,
  OperationalEvent,
  ScheduledScoutingJob,
  ScoutingRunExecution,
} from "@/server/operations/operation-types";

interface OperationsResponse {
  monitoring: OperationMonitoringSnapshot;
  schedules: ScheduledScoutingJob[];
  executions: ScoutingRunExecution[];
  events: OperationalEvent[];
}

export default function OperationsPage(): React.ReactNode {
  const [data, setData] = useState<OperationsResponse | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("정기 자동 스카우팅");
  const [intervalMinutes, setIntervalMinutes] = useState(1440);
  const [target, setTarget] = useState(10);

  const refresh = useCallback(async (): Promise<void> => {
    const response = await fetch("/api/operations", { cache: "no-store" });
    if (!response.ok) throw new Error("운영 상태를 불러오지 못했습니다.");
    setData(await response.json() as OperationsResponse);
  }, []);

  useEffect(() => { void refresh().catch((error: unknown) => setMessage(error instanceof Error ? error.message : "운영 상태를 불러오지 못했습니다.")); }, [refresh]);

  const action = async (body: object, successMessage: string): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/operations", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const result = await response.json() as OperationsResponse & { message?: string };
      if (!response.ok) throw new Error(result.message ?? "운영 상태를 변경하지 못했습니다.");
      setData(result);
      setMessage(successMessage);
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : "운영 상태를 변경하지 못했습니다.");
    } finally { setBusy(false); }
  };

  return <>
    <PageHeader title="운영 제어" description="예약 실행, 중복 실행 잠금, 복구 상태와 모니터링 신호를 관리합니다." />
    {message && <p role="status" className="mb-5 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">{message}</p>}
    {!data ? <p className="panel p-6 text-sm text-slate-500">운영 상태를 불러오는 중입니다.</p> : <>
      <section className={`mb-6 rounded-xl border p-5 ${data.monitoring.control.paused ? "border-amber-200 bg-amber-50" : "border-emerald-200 bg-emerald-50"}`} aria-label="운영 상태">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div><h2 className="font-bold text-ink">{data.monitoring.control.paused ? "운영 중지" : "운영 중"}</h2><p className="mt-1 text-sm text-slate-600">{data.monitoring.control.reason ?? "예약된 자동 실행을 처리할 수 있습니다."}</p></div>
          <div className="flex gap-2">
            {data.monitoring.control.paused
              ? <button className="button-primary" disabled={busy} onClick={() => void action({ action: "resume" }, "운영을 재개했습니다.")}>운영 재개</button>
              : <button className="button-secondary" disabled={busy} onClick={() => void action({ action: "pause", reason: "관리자 수동 중지" }, "운영을 중지했습니다.")}>운영 중지</button>}
            <button className="button-secondary" disabled={busy || data.monitoring.control.paused} onClick={() => void action({ action: "run_due" }, "실행 가능한 예약 작업을 확인했습니다.")}>예약 작업 확인</button>
          </div>
        </div>
      </section>
      <section aria-label="운영 모니터링" className="mb-7 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {monitoringCards(data.monitoring).map(([label, value]) => <div className="panel p-4" key={label}><p className="text-xs font-semibold text-slate-500">{label}</p><p className="mt-2 text-2xl font-bold text-ink">{value}</p></div>)}
      </section>
      <section className="panel mb-6 p-5 sm:p-6">
        <h2 className="text-lg font-bold text-ink">예약 추가</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <label className="sm:col-span-3"><span className="mb-2 block text-sm font-semibold text-slate-700">예약 이름</span><input className="input" value={name} onChange={(event) => setName(event.target.value)} /></label>
          <label><span className="mb-2 block text-sm font-semibold text-slate-700">실행 간격(분)</span><input className="input" type="number" min={1} max={10080} value={intervalMinutes} onChange={(event) => setIntervalMinutes(Number(event.target.value))} /></label>
          <label><span className="mb-2 block text-sm font-semibold text-slate-700">스카우팅 목표</span><input className="input" type="number" min={1} max={500} value={target} onChange={(event) => setTarget(Number(event.target.value))} /></label>
          <div className="flex items-end"><button className="button-primary w-full" disabled={busy || !name.trim()} onClick={() => void action({
            action: "create_schedule", name, intervalMinutes,
            request: { targetRecommendedCount: target },
          }, "예약 작업을 추가했습니다.")}>예약 저장</button></div>
        </div>
      </section>
      <ScheduleTable schedules={data.schedules} busy={busy} onToggle={(id, enabled) => action({ action: "set_schedule_enabled", id, enabled }, enabled ? "예약을 활성화했습니다." : "예약을 중지했습니다.")} />
      <ExecutionTable executions={data.executions} />
      <EventTable events={data.events} />
    </>}
  </>;
}

function monitoringCards(snapshot: OperationMonitoringSnapshot): Array<readonly [string, string]> {
  return [
    ["실행 대기", formatNumber(snapshot.dueJobs)], ["활성 예약", formatNumber(snapshot.enabledJobs)],
    ["실행 중", formatNumber(snapshot.runningExecutions)], ["성공", formatNumber(snapshot.succeededExecutions)],
    ["실패", formatNumber(snapshot.failedExecutions)], ["중단 복구", formatNumber(snapshot.interruptedExecutions)],
    ["잠금 충돌", formatNumber(snapshot.lockConflicts)], ["과거 중복 건너뜀", formatNumber(snapshot.priorHistorySkipped)],
    ["후보 실패", formatNumber(snapshot.failedCandidates)],
  ];
}

function ScheduleTable({ schedules, busy, onToggle }: { schedules: ScheduledScoutingJob[]; busy: boolean; onToggle: (id: string, enabled: boolean) => Promise<void> }): React.ReactNode {
  return <section className="panel mb-6 overflow-hidden"><div className="border-b border-slate-200 px-5 py-4"><h2 className="text-lg font-bold text-ink">예약 작업</h2></div>
    {schedules.length === 0 ? <p className="p-6 text-sm text-slate-500">등록된 예약 작업이 없습니다.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="px-5 py-3">이름</th><th className="px-5 py-3">간격</th><th className="px-5 py-3">스카우팅 목표</th><th className="px-5 py-3">다음 실행</th><th className="px-5 py-3">연속 실패</th><th className="px-5 py-3">상태</th></tr></thead><tbody className="divide-y divide-slate-100">{schedules.map((job) => <tr key={job.id}><td className="px-5 py-4 font-semibold">{job.name}</td><td className="px-5 py-4">{job.intervalMinutes}분</td><td className="px-5 py-4">{job.request.targetRecommendedCount}명</td><td className="px-5 py-4">{formatDateTime(job.nextRunAt)}</td><td className="px-5 py-4">{job.consecutiveFailures}</td><td className="px-5 py-4"><button className="button-secondary" disabled={busy} onClick={() => void onToggle(job.id, !job.enabled)}>{job.enabled ? "예약 중지" : "예약 활성화"}</button></td></tr>)}</tbody></table></div>}
  </section>;
}

function ExecutionTable({ executions }: { executions: ScoutingRunExecution[] }): React.ReactNode {
  return <section className="panel mb-6 overflow-hidden"><div className="border-b border-slate-200 px-5 py-4"><h2 className="text-lg font-bold text-ink">최근 실행</h2></div>
    {executions.length === 0 ? <p className="p-6 text-sm text-slate-500">운영 실행 기록이 없습니다.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="px-5 py-3">상관관계 ID</th><th className="px-5 py-3">유형</th><th className="px-5 py-3">상태</th><th className="px-5 py-3">시도</th><th className="px-5 py-3">시작</th></tr></thead><tbody className="divide-y divide-slate-100">{executions.map((execution) => <tr key={execution.id}><td className="px-5 py-4 font-mono text-xs">{execution.correlationId}</td><td className="px-5 py-4">{triggerLabel(execution.trigger)}</td><td className="px-5 py-4">{executionStatusLabel(execution.status)}</td><td className="px-5 py-4">{execution.attemptCount}</td><td className="px-5 py-4">{formatDateTime(execution.startedAt)}</td></tr>)}</tbody></table></div>}
  </section>;
}

function EventTable({ events }: { events: OperationalEvent[] }): React.ReactNode {
  return <section className="panel overflow-hidden"><div className="border-b border-slate-200 px-5 py-4"><h2 className="text-lg font-bold text-ink">운영 이벤트</h2></div>
    {events.length === 0 ? <p className="p-6 text-sm text-slate-500">기록된 운영 이벤트가 없습니다.</p> : <ul className="divide-y divide-slate-100">{events.slice(0, 20).map((event) => <li className="px-5 py-4" key={event.id}><div className="flex flex-wrap items-center gap-2"><span className="text-xs font-semibold text-slate-500">{event.level.toUpperCase()}</span><span className="font-medium text-ink">{event.message}</span></div><p className="mt-1 font-mono text-xs text-slate-500">{event.correlationId} · {formatDateTime(event.createdAt)}</p></li>)}</ul>}
  </section>;
}

function triggerLabel(trigger: ScoutingRunExecution["trigger"]): string { return { manual: "수동", scheduled: "예약", recovery: "복구" }[trigger]; }
function executionStatusLabel(status: ScoutingRunExecution["status"]): string { return { running: "실행 중", succeeded: "성공", failed: "실패", interrupted: "중단", skipped_locked: "잠금으로 건너뜀", skipped_paused: "운영 중지로 건너뜀" }[status]; }
