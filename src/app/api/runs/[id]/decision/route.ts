import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  applyManualDecision,
  createServerManualDecisionDependencies,
  ManualDecisionError,
} from "@/server/scouting/manual-decision-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const requestSchema = z.object({
  creatorInternalId: z.string().trim().min(1).max(300),
  decision: z.enum(["recommended", "hold", "excluded"]),
  reason: z.enum([
    "marketer_fit",
    "contact_verified",
    "campaign_mismatch",
    "insufficient_evidence",
    "do_not_contact",
    "duplicate_or_invalid",
    "other",
  ]),
  note: z.string().trim().max(500).default(""),
});

export function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
): NextResponse {
  const creatorInternalId = request.nextUrl.searchParams.get("creatorInternalId")?.trim();
  const { auditRepository } = createServerManualDecisionDependencies();
  return NextResponse.json(auditRepository.list({
    runId: params.id,
    ...(creatorInternalId ? { creatorInternalId } : {}),
  }));
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  const parsed = await parseBody(request);
  if (!parsed) return NextResponse.json({ message: "수동 판정 요청값이 올바르지 않습니다." }, { status: 400 });
  try {
    const dependencies = createServerManualDecisionDependencies();
    const result = dependencies.database.transaction(() =>
      applyManualDecision({ runId: params.id, ...parsed }, dependencies))();
    return NextResponse.json({ creator: result.creator, audit: result.audit, statistics: result.run.statistics });
  } catch (error: unknown) {
    if (error instanceof ManualDecisionError) {
      const status = ["run_not_found", "creator_not_found", "history_not_found"].includes(error.reason) ? 404 : 409;
      return NextResponse.json({ message: error.message, reason: error.reason }, { status });
    }
    return NextResponse.json({ message: "수동 판정을 저장하지 못했습니다." }, { status: 500 });
  }
}

async function parseBody(request: NextRequest): Promise<z.infer<typeof requestSchema> | null> {
  try {
    const result = requestSchema.safeParse(await request.json() as unknown);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}
