import { NextRequest, NextResponse } from "next/server";
import { historyRecordArraySchema } from "@/server/history/history-record-schema";
import { getServerHistoryRepository } from "@/server/history/server-history-repository";
import type { HistoryStatus } from "@/types/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: NextRequest): NextResponse {
  const statusValue = request.nextUrl.searchParams.get("status");
  const status = isHistoryStatus(statusValue) || statusValue === "all" ? statusValue : undefined;
  const records = getServerHistoryRepository().search({
    query: request.nextUrl.searchParams.get("query") ?? undefined,
    category: request.nextUrl.searchParams.get("category") ?? undefined,
    status,
  });
  return NextResponse.json(records);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await readBody(request);
  if (!body) return NextResponse.json({ message: "히스토리 요청 형식이 올바르지 않습니다." }, { status: 400 });
  return NextResponse.json(getServerHistoryRepository().addOrUpdateMany(body));
}

async function readBody(request: NextRequest): Promise<ReturnType<typeof historyRecordArraySchema.parse> | null> {
  try {
    const body = await request.json() as unknown;
    if (typeof body !== "object" || body === null || !("records" in body)) return null;
    const parsed = historyRecordArraySchema.safeParse(body.records);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function isHistoryStatus(value: string | null): value is HistoryStatus {
  return value === "recommended" || value === "candidate" || value === "excluded";
}
