import { NextRequest, NextResponse } from "next/server";
import { historyRecordArraySchema } from "@/server/history/history-record-schema";
import { getServerHistoryRepository } from "@/server/history/server-history-repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json() as unknown;
    if (typeof body !== "object" || body === null || !("records" in body)) throw new Error("missing records");
    const records = historyRecordArraySchema.parse(body.records);
    return NextResponse.json(getServerHistoryRepository().addOrUpdateMany(records));
  } catch {
    return NextResponse.json({ message: "브라우저 히스토리 전환 데이터가 올바르지 않습니다." }, { status: 400 });
  }
}
