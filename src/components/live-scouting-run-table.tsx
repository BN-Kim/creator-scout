import Link from "next/link";
import { formatDateTime, formatNumber } from "@/lib/format";
import type { OperationalEvent, ScoutingRunExecution } from "@/server/operations/operation-types";

interface RunMetadata {
  targetRecommendedCount: number | null;
  recommendationsFilled: number | null;
}

export function LiveScoutingRunTable({
  executions,
  events,
}: {
  executions: ScoutingRunExecution[];
  events: OperationalEvent[];
}): React.ReactNode {
  if (executions.length === 0) {
    return <p className="p-6 text-sm text-slate-500">아직 실제 추천 실행 기록이 없습니다.</p>;
  }

  return <div className="overflow-x-auto">
    <table className="w-full min-w-[1120px] text-left text-sm">
      <thead className="border-y border-slate-200 bg-slate-50 text-xs font-semibold text-slate-500">
        <tr>
          <th className="whitespace-nowrap px-4 py-3">실행</th>
          <th className="whitespace-nowrap px-4 py-3">유형</th>
          <th className="whitespace-nowrap px-4 py-3">시작 시각(KST)</th>
          <th className="whitespace-nowrap px-4 py-3">상태</th>
          <th className="whitespace-nowrap px-4 py-3 text-right">추천 목표</th>
          <th className="whitespace-nowrap px-4 py-3 text-right">추천 충족</th>
          <th className="whitespace-nowrap px-4 py-3 text-right">과거 중복</th>
          <th className="whitespace-nowrap px-4 py-3 text-right">실패</th>
          <th className="whitespace-nowrap px-4 py-3">종료 사유</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {executions.map((execution) => {
          const metadata = metadataFor(execution, events);
          return <tr key={execution.id} className="hover:bg-slate-50">
            <td className="whitespace-nowrap px-4 py-4 font-semibold text-ink">
              {execution.runId
                ? <Link href={`/runs/${execution.runId}`} className="hover:text-brand hover:underline">{shortRunId(execution.runId)}</Link>
                : shortRunId(execution.id)}
            </td>
            <td className="whitespace-nowrap px-4 py-4 text-slate-600">{triggerLabel(execution.trigger)}</td>
            <td className="px-4 py-4 whitespace-nowrap text-slate-500">{formatDateTime(execution.startedAt)}</td>
            <td className="whitespace-nowrap px-4 py-4"><ExecutionStatus status={execution.status} /></td>
            <td className="px-4 py-4 text-right tabular-nums">{numberOrDash(metadata.targetRecommendedCount)}</td>
            <td className="px-4 py-4 text-right tabular-nums">{numberOrDash(metadata.recommendationsFilled)}</td>
            <td className="px-4 py-4 text-right tabular-nums">{formatNumber(execution.priorHistorySkipped)}</td>
            <td className="px-4 py-4 text-right tabular-nums">{formatNumber(execution.failedCandidates)}</td>
            <td className="whitespace-nowrap px-4 py-4 text-xs text-slate-500">{stopReasonLabel(execution.stopReason)}</td>
          </tr>;
        })}
      </tbody>
    </table>
  </div>;
}

function metadataFor(execution: ScoutingRunExecution, events: OperationalEvent[]): RunMetadata {
  const relevant = events.filter((event) => event.executionId === execution.id);
  const completed = relevant.find((event) => event.eventType === "run_succeeded");
  const started = relevant.find((event) => event.eventType === "run_started");
  return {
    targetRecommendedCount: numericMetadata(completed ?? started, "targetRecommendedCount"),
    recommendationsFilled: numericMetadata(completed, "recommendationsFilled"),
  };
}

function numericMetadata(event: OperationalEvent | undefined, key: string): number | null {
  const value = event?.metadata[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function numberOrDash(value: number | null): string {
  return value === null ? "—" : formatNumber(value);
}

function shortRunId(value: string): string {
  return value.length > 24 ? `${value.slice(0, 21)}…` : value;
}

function triggerLabel(trigger: ScoutingRunExecution["trigger"]): string {
  return { manual: "수동", scheduled: "예약", recovery: "복구" }[trigger];
}

function ExecutionStatus({ status }: { status: ScoutingRunExecution["status"] }): React.ReactNode {
  const label = {
    running: "실행 중", succeeded: "완료", failed: "실패", interrupted: "중단",
    skipped_locked: "중복 실행 차단", skipped_paused: "운영 중지",
  }[status];
  const style = {
    running: "bg-blue-50 text-blue-700", succeeded: "bg-emerald-50 text-emerald-700",
    failed: "bg-rose-50 text-rose-700", interrupted: "bg-amber-50 text-amber-700",
    skipped_locked: "bg-slate-100 text-slate-600", skipped_paused: "bg-slate-100 text-slate-600",
  }[status];
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${style}`}>{label}</span>;
}

function stopReasonLabel(reason: string | null): string {
  if (!reason) return "—";
  const labels: Record<string, string> = {
    target_reached: "추천 목표 충족",
    source_exhausted: "발견 소스 소진",
    candidate_limit_reached: "후보 한도 도달",
    page_limit_reached: "페이지 한도 도달",
    time_limit_reached: "시간 한도 도달",
    provider_failure_limit_reached: "공급자 실패 한도 도달",
  };
  return labels[reason] ?? reason;
}
