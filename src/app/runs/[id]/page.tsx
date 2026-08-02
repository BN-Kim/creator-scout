import { getServerHistoryRepository } from "@/server/history/server-history-repository";
import { getAutomaticRunResult } from "@/server/scouting/automatic-run-result-store";
import { runFictionalAutomaticScouting } from "@/server/scouting/fictional-automatic-run";
import { AutomaticRunResult } from "./automatic-run-result";
import { RunDetailClient } from "./run-detail-client";
import { PendingAutomaticRun } from "./pending-automatic-run";

export default async function RunDetailPage({ params, searchParams }: { params: { id: string }; searchParams?: { executionId?: string } }): Promise<React.ReactNode> {
  if (params.id === "automatic-h4-mock-run") {
    const run = await runFictionalAutomaticScouting(getServerHistoryRepository());
    return <AutomaticRunResult run={run} />;
  }
  if (params.id.startsWith("automatic-")) {
    const run = getAutomaticRunResult(params.id);
    if (run) return <AutomaticRunResult run={run} />;
    return <PendingAutomaticRun runId={params.id} executionId={searchParams?.executionId} />;
  }
  return <RunDetailClient runId={params.id} />;
}
