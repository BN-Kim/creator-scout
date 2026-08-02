import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  addServerMarketingOutcome,
  listServerMarketingOutcomes,
  MarketingOutcomeError,
} from "@/server/marketing/marketing-outcome-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const optionalMetric = z.number().int().nonnegative().nullable().optional();
const outcomeSchema = z.object({
  outcomeType: z.enum(["marketer_approved", "contact_attempted", "replied", "meeting", "contracted", "content_published", "campaign_performance"]),
  occurredAt: z.string().datetime(),
  note: z.string().trim().max(500).default(""),
  contentUrl: z.union([z.string().url(), z.literal(""), z.null()]).optional(),
  views: optionalMetric,
  likes: optionalMetric,
  comments: optionalMetric,
  conversions: optionalMetric,
  revenueKrw: optionalMetric,
}).superRefine((input, context) => {
  if (input.outcomeType !== "campaign_performance") return;
  if (!input.contentUrl && [input.views, input.likes, input.comments, input.conversions, input.revenueKrw].every((value) => value === undefined || value === null)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["views"], message: "콘텐츠 성과에는 URL 또는 하나 이상의 성과 수치가 필요합니다." });
  }
});

export function GET(_request: NextRequest, { params }: { params: { id: string } }): NextResponse {
  return NextResponse.json(listServerMarketingOutcomes({ historyRecordId: params.id }));
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }): Promise<NextResponse> {
  const parsed = await parseBody(request);
  if (!parsed) return NextResponse.json({ message: "마케팅 성과 입력값이 올바르지 않습니다." }, { status: 400 });
  try {
    return NextResponse.json(addServerMarketingOutcome({ historyRecordId: params.id, ...parsed }), { status: 201 });
  } catch (error: unknown) {
    if (error instanceof MarketingOutcomeError) return NextResponse.json({ message: error.message }, { status: 404 });
    return NextResponse.json({ message: "마케팅 성과를 저장하지 못했습니다." }, { status: 500 });
  }
}

async function parseBody(request: NextRequest): Promise<z.infer<typeof outcomeSchema> | null> {
  try {
    const result = outcomeSchema.safeParse(await request.json() as unknown);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}
