"use client";

import { useCallback, useEffect, useState } from "react";
import { subscribeToOperationsChanged } from "@/lib/operations-refresh";
import type { OperationsSnapshot } from "@/server/operations/operation-types";

export function useOperationsSnapshot(): {
  data: OperationsSnapshot | null;
  error: string | null;
  refresh: () => Promise<void>;
} {
  const [data, setData] = useState<OperationsSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const response = await fetch("/api/operations", { cache: "no-store" });
      if (!response.ok) throw new Error("스카우트 기록을 불러오지 못했습니다.");
      setData(await response.json() as OperationsSnapshot);
      setError(null);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "스카우트 기록을 불러오지 못했습니다.");
    }
  }, []);

  useEffect(() => {
    void refresh();
    return subscribeToOperationsChanged(() => { void refresh(); });
  }, [refresh]);

  return { data, error, refresh };
}
