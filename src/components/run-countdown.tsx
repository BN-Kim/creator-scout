"use client";

import { useEffect, useState } from "react";
import { automaticScoutingRunLimitMs } from "@/config/automatic-scouting";
import { formatRunCountdown, remainingRunTimeMs } from "@/lib/run-countdown";

export function RunCountdown({ startedAtMs }: { startedAtMs: number | null }): React.ReactNode {
  const [remainingMs, setRemainingMs] = useState(automaticScoutingRunLimitMs);

  useEffect(() => {
    if (startedAtMs === null) {
      setRemainingMs(automaticScoutingRunLimitMs);
      return;
    }
    const update = (): void => {
      setRemainingMs(remainingRunTimeMs(startedAtMs, Date.now(), automaticScoutingRunLimitMs));
    };
    update();
    const timer = window.setInterval(update, 250);
    return () => window.clearInterval(timer);
  }, [startedAtMs]);

  const expired = startedAtMs !== null && remainingMs === 0;
  return <div
    aria-label="자동 검색 제한 시간"
    aria-live="polite"
    className={`rounded-xl border px-4 py-3 ${expired ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-slate-50"}`}
  >
    <p className="text-xs font-semibold text-slate-500">최대 남은 시간</p>
    <p className={`mt-1 font-mono text-2xl font-bold tabular-nums ${expired ? "text-amber-700" : "text-ink"}`}>
      {formatRunCountdown(remainingMs)}
    </p>
    <p className="mt-1 text-xs text-slate-500">
      {expired ? "검색을 종료하고 현재까지 완료된 결과를 정리하고 있습니다." : "자동 검색은 최대 1분 동안 진행됩니다."}
    </p>
  </div>;
}
