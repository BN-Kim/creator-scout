import { NextRequest, NextResponse } from "next/server";
import { automaticRunConfigurationSchema } from "@/server/operations/automatic-run-configuration";
import { ensureOperationRuntime } from "@/server/operations/operation-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const input = await parseRequest(request);
  if (!input) return NextResponse.json({ message: "추천 실행 입력값이 올바르지 않습니다." }, { status: 400 });

  const outcome = await ensureOperationRuntime().coordinator.executeManual(input);
  if (outcome.kind === "completed" && outcome.result) {
    return NextResponse.json({ runId: outcome.result.runId, correlationId: outcome.correlationId });
  }
  if (outcome.kind === "paused") {
    return NextResponse.json({ message: "운영이 중지되어 새 실행을 시작할 수 없습니다.", correlationId: outcome.correlationId }, { status: 503 });
  }
  if (outcome.kind === "locked") {
    return NextResponse.json({ message: "다른 자동 실행이 진행 중입니다.", correlationId: outcome.correlationId }, { status: 409 });
  }
  const status = outcome.errorCategory === "configuration" ? 503 : 500;
  const message = outcome.errorCategory === "configuration" ? "YouTube 공급자 설정을 확인해 주세요." : "자동 스카우팅 실행을 완료하지 못했습니다.";
  return NextResponse.json({ message, correlationId: outcome.correlationId }, { status });
}

async function parseRequest(request: NextRequest) {
  try {
    const parsed = automaticRunConfigurationSchema.safeParse(await request.json() as unknown);
    return parsed.success ? parsed.data : null;
  } catch { return null; }
}
