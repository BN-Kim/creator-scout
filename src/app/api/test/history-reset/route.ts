import { NextRequest, NextResponse } from "next/server";
import { getServerHistoryRepository } from "@/server/history/server-history-repository";
import { getServerOperationRepository } from "@/server/operations/server-operation-repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(request: NextRequest): NextResponse {
  if (process.env.E2E_TEST_MODE !== "1" || request.headers.get("x-e2e-test") !== "reset-history") {
    return NextResponse.json({ message: "찾을 수 없습니다." }, { status: 404 });
  }
  getServerHistoryRepository().replace([]);
  const operations = getServerOperationRepository();
  operations.resetForTests(new Date().toISOString());
  return NextResponse.json({ reset: true });
}
