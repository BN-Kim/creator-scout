import { NextRequest, NextResponse } from "next/server";
import { recommendationSettingsSchema } from "@/config/recommendation-rules";
import {
  AutomaticRunReevaluationError,
  reevaluateServerAutomaticRun,
} from "@/server/scouting/reevaluate-automatic-run";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  const settings = await parseOptionalSettings(request);
  if (settings === false) {
    return NextResponse.json({ message: "재평가 설정값이 올바르지 않습니다." }, { status: 400 });
  }
  try {
    const result = reevaluateServerAutomaticRun(params.id, settings ?? undefined);
    return NextResponse.json({
      runId: result.runId,
      sourceRunId: result.sourceRunId,
      statistics: result.statistics,
      diagnostics: result.diagnostics,
    });
  } catch (error: unknown) {
    if (error instanceof AutomaticRunReevaluationError) {
      return NextResponse.json({ message: error.message }, { status: 404 });
    }
    return NextResponse.json({ message: "저장된 근거 재평가를 완료하지 못했습니다." }, { status: 500 });
  }
}

async function parseOptionalSettings(
  request: NextRequest,
): Promise<ReturnType<typeof recommendationSettingsSchema.parse> | null | false> {
  const text = await request.text();
  if (!text.trim()) return null;
  try {
    const body = JSON.parse(text) as unknown;
    if (typeof body !== "object" || body === null) return false;
    if (!("settings" in body)) return null;
    const parsed = recommendationSettingsSchema.safeParse((body as { settings: unknown }).settings);
    return parsed.success ? parsed.data : false;
  } catch {
    return false;
  }
}
