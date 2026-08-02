"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import type { ScoutingRunExecution } from "@/server/operations/operation-types";

interface PendingStatus {
  state: "running" | "finishing" | "completed" | "failed" | "not_found";
  runId: string;
  execution: ScoutingRunExecution | null;
}

export function PendingAutomaticRun({ runId, executionId }: { runId: string; executionId?: string }): React.ReactNode {
  const router = useRouter();
  const [status, setStatus] = useState<PendingStatus | null>(null);
  const [pollFailures, setPollFailures] = useState(0);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const poll = async (): Promise<void> => {
      try {
        const query = executionId ? `?executionId=${encodeURIComponent(executionId)}` : "";
        const response = await fetch(`/api/runs/${encodeURIComponent(runId)}/status${query}`, { cache: "no-store" });
        if (!response.ok) throw new Error("status request failed");
        const next = await response.json() as PendingStatus;
        if (!active) return;
        setStatus(next);
        setPollFailures(0);
        if (next.state === "completed") {
          router.refresh();
          return;
        }
      } catch {
        if (active) setPollFailures((count) => count + 1);
      }
      if (active) timer = setTimeout(() => void poll(), 2_500);
    };
    void poll();
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [executionId, router, runId]);

  const failed = status?.state === "failed";
  const definitivelyMissing = status?.state === "not_found" && !executionId;
  return <>
    <PageHeader title="백그라운드 스카우팅" description="큰 목표 실행은 브라우저 요청과 분리해 서버에서 계속 처리합니다." />
    <div role="status" className={`panel p-8 ${failed || definitivelyMissing ? "border-rose-200" : "border-blue-200"}`}>
      <div className="flex items-center gap-3">
        {!failed && !definitivelyMissing && <span aria-hidden className="h-3 w-3 animate-pulse rounded-full bg-blue-500" />}
        <h1 className="text-xl font-bold text-ink">
          {failed ? "실행을 완료하지 못했습니다" : definitivelyMissing ? "실행을 찾을 수 없습니다" : "후보를 탐색하고 평가하는 중입니다"}
        </h1>
      </div>
      <p className="mt-3 text-sm text-slate-600">
        {failed
          ? `상태: ${status.execution?.status ?? "failed"} · 오류: ${status.execution?.errorCategory ?? "확인 필요"}`
          : definitivelyMissing
            ? "실행 ID가 만료되었거나 존재하지 않습니다. 스카우트 기록에서 실행 상태를 확인해 주세요."
            : "이 페이지를 닫아도 로컬 서버가 실행 중인 동안 작업은 계속됩니다. 완료되면 결과 화면으로 자동 전환됩니다."}
      </p>
      <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
        <div><dt className="text-xs font-semibold text-slate-500">실행 ID</dt><dd className="mt-1 break-all font-medium text-ink">{runId}</dd></div>
        <div><dt className="text-xs font-semibold text-slate-500">실행 상태</dt><dd className="mt-1 font-medium text-ink">{status?.execution?.status ?? (executionId ? "대기열 등록 중" : "확인 중")}</dd></div>
      </dl>
      {pollFailures > 0 && <p className="mt-4 text-xs text-amber-700">상태 확인을 다시 시도하고 있습니다 ({pollFailures}회).</p>}
    </div>
  </>;
}
