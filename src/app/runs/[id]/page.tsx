import { getServerHistoryRepository } from "@/server/history/server-history-repository";
import { getAutomaticRunResult } from "@/server/scouting/automatic-run-result-store";
import { runFictionalAutomaticScouting } from "@/server/scouting/fictional-automatic-run";
import { AutomaticRunResult } from "./automatic-run-result";
import { RunDetailClient } from "./run-detail-client";

export default async function RunDetailPage({ params }: { params: { id: string } }): Promise<React.ReactNode> {
  if (params.id === "automatic-h4-mock-run") {
    const run = await runFictionalAutomaticScouting(getServerHistoryRepository());
    return <AutomaticRunResult run={run} />;
  }
  if (params.id.startsWith("automatic-")) {
    const run = getAutomaticRunResult(params.id);
    if (run) return <AutomaticRunResult run={run} />;
    return <div className="panel p-8"><h1 className="text-xl font-bold text-ink">실행 결과를 찾을 수 없습니다</h1><p className="mt-2 text-sm text-slate-500">서버가 다시 시작되었거나 현재 실행 결과가 만료되었습니다. 확정된 판정은 크리에이터 히스토리에서 확인할 수 있습니다.</p></div>;
  }
  return <RunDetailClient runId={params.id} />;
}
