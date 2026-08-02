import { NextRequest, NextResponse } from "next/server";
import { getServerOperationRepository } from "@/server/operations/server-operation-repository";
import { getAutomaticRunResult } from "@/server/scouting/automatic-run-result-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
): NextResponse {
  const result = getAutomaticRunResult(params.id);
  if (result) {
    return NextResponse.json({ state: "completed", runId: result.runId, execution: null });
  }
  const executionId = request.nextUrl.searchParams.get("executionId");
  const repository = getServerOperationRepository();
  const execution = executionId
    ? repository.getExecution(executionId)
    : repository.listExecutions(100).find((item) => item.runId === params.id) ?? null;
  if (!execution) return NextResponse.json({ state: "not_found", runId: params.id, execution: null });
  const state = execution.status === "running"
    ? "running"
    : execution.status === "succeeded"
      ? "finishing"
      : "failed";
  return NextResponse.json({ state, runId: params.id, execution });
}
