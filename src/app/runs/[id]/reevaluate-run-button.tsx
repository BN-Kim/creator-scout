"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ReevaluateRunButton({ sourceRunId }: { sourceRunId: string }): React.ReactNode {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  const reevaluate = async (): Promise<void> => {
    setPending(true);
    setError("");
    try {
      const response = await fetch(`/api/runs/${encodeURIComponent(sourceRunId)}/reevaluate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const payload = await response.json() as { runId?: string; message?: string };
      if (!response.ok || !payload.runId) throw new Error(payload.message ?? "재평가 요청에 실패했습니다.");
      router.push(`/runs/${encodeURIComponent(payload.runId)}`);
      router.refresh();
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "재평가 요청에 실패했습니다.");
      setPending(false);
    }
  };

  return <div className="flex flex-col items-end gap-1">
    <button
      type="button"
      className="focus-ring rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white disabled:cursor-wait disabled:opacity-60"
      disabled={pending}
      onClick={() => void reevaluate()}
    >
      {pending ? "재평가 중…" : "저장 근거로 새 기준 재평가"}
    </button>
    {error && <span role="alert" className="text-xs text-rose-600">{error}</span>}
  </div>;
}
