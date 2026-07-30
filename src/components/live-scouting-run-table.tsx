import Link from "next/link";
import { formatHistoryDateTimeParts, formatNumber } from "@/lib/format";
import type { OperationalEvent, ScoutingRunExecution } from "@/server/operations/operation-types";

interface RunMetadata {
  targetRecommendedCount: number | null;
  recommendationsFilled: number | null;
}

interface RunPresentation {
  execution: ScoutingRunExecution;
  metadata: RunMetadata;
  hasStoredResult: boolean;
  executedAt: ReturnType<typeof formatHistoryDateTimeParts>;
}

export function LiveScoutingRunTable({
  executions,
  events,
  availableRunIds,
}: {
  executions: ScoutingRunExecution[];
  events: OperationalEvent[];
  availableRunIds: string[];
}): React.ReactNode {
  if (executions.length === 0) {
    return <p className="p-6 text-sm text-slate-500">아직 실제 스카우트 기록이 없습니다.</p>;
  }

  const rows: RunPresentation[] = executions.map((execution) => ({
    execution,
    metadata: metadataFor(execution, events),
    hasStoredResult: execution.runId !== null && availableRunIds.includes(execution.runId),
    executedAt: formatHistoryDateTimeParts(execution.startedAt),
  }));

  return <>
    <table className="hidden w-full table-fixed text-left text-sm xl:table">
      <colgroup>
        <col className="w-[23%]" />
        <col className="w-[16%]" />
        <col className="w-[12%]" />
        <col className="w-[8%]" />
        <col className="w-[7%]" />
        <col className="w-[7%]" />
        <col className="w-[7%]" />
        <col className="w-[20%]" />
      </colgroup>
      <thead className="border-y border-slate-200 bg-slate-50 text-xs font-semibold text-slate-500">
        <tr>
          <th className="px-3 py-3">실행</th>
          <th className="px-3 py-3">실행 시간</th>
          <th className="px-3 py-3">상태</th>
          <th className="px-2 py-3 text-right">목표</th>
          <th className="px-2 py-3 text-right">추천</th>
          <th className="px-2 py-3 text-right">중복</th>
          <th className="px-2 py-3 text-right">실패</th>
          <th className="px-3 py-3">종료 사유</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {rows.map(({ execution, metadata, hasStoredResult, executedAt }) => {
          return <tr key={execution.id} className="hover:bg-slate-50">
            <td className="min-w-0 px-3 py-4 font-semibold text-ink">
              {execution.runId && hasStoredResult
                ? <Link href={`/runs/${execution.runId}`} className="block truncate hover:text-brand hover:underline" title={execution.runId}>{shortRunId(execution.runId)}</Link>
                : <span className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate" title={execution.runId ?? execution.id}>{shortRunId(execution.runId ?? execution.id)}</span>
                    {execution.runId && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">상세 없음</span>}
                  </span>}
            </td>
            <td className="px-3 py-4 text-slate-500">
              <time dateTime={execution.startedAt} className="flex flex-col leading-5">
                <span>{executedAt.date}</span>
                <span>{executedAt.time}</span>
              </time>
            </td>
            <td className="px-3 py-4"><ExecutionStatus status={execution.status} /></td>
            <td className="px-2 py-4 text-right tabular-nums">{numberOrDash(metadata.targetRecommendedCount)}</td>
            <td className="px-2 py-4 text-right tabular-nums">{numberOrDash(metadata.recommendationsFilled)}</td>
            <td className="px-2 py-4 text-right tabular-nums">{formatNumber(execution.priorHistorySkipped)}</td>
            <td className="px-2 py-4 text-right tabular-nums">{formatNumber(execution.failedCandidates)}</td>
            <td className="px-3 py-4 text-xs leading-5 text-slate-500">{stopReasonLabel(execution.stopReason)}</td>
          </tr>;
        })}
      </tbody>
    </table>
    <ul aria-label="스카우트 기록 목록" className="divide-y divide-slate-200 xl:hidden">
      {rows.map(({ execution, metadata, hasStoredResult, executedAt }) => (
        <li key={execution.id} className="space-y-4 p-4 sm:p-5">
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="min-w-0 font-semibold text-ink">
              {execution.runId && hasStoredResult
                ? <Link href={`/runs/${execution.runId}`} className="block truncate hover:text-brand hover:underline" title={execution.runId}>{shortRunId(execution.runId)}</Link>
                : <span className="block truncate" title={execution.runId ?? execution.id}>{shortRunId(execution.runId ?? execution.id)}</span>}
              {execution.runId && !hasStoredResult && <span className="mt-1 inline-flex rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">상세 없음</span>}
            </div>
            <ExecutionStatus status={execution.status} />
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-4">
            <RunMetric label="실행 시간">
              <time dateTime={execution.startedAt} className="flex flex-col">
                <span>{executedAt.date}</span>
                <span>{executedAt.time}</span>
              </time>
            </RunMetric>
            <RunMetric label="목표" value={numberOrDash(metadata.targetRecommendedCount)} />
            <RunMetric label="추천" value={numberOrDash(metadata.recommendationsFilled)} />
            <RunMetric label="중복" value={formatNumber(execution.priorHistorySkipped)} />
            <RunMetric label="실패" value={formatNumber(execution.failedCandidates)} />
            <RunMetric label="종료 사유" value={stopReasonLabel(execution.stopReason)} />
          </dl>
        </li>
      ))}
    </ul>
  </>;
}

function RunMetric({
  label,
  value,
  children,
}: {
  label: string;
  value?: string;
  children?: React.ReactNode;
}): React.ReactNode {
  return <div className="min-w-0">
    <dt className="text-xs font-semibold text-slate-500">{label}</dt>
    <dd className="mt-1 break-words text-ink">{children ?? value}</dd>
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
    target_reached: "스카우팅 목표 충족",
    source_exhausted: "발견 소스 소진",
    candidate_limit_reached: "후보 한도 도달",
    page_limit_reached: "페이지 한도 도달",
    time_limit_reached: "시간 한도 도달",
    provider_failure_limit_reached: "공급자 실패 한도 도달",
  };
  return labels[reason] ?? reason;
}
