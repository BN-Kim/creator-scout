import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { defaultRecommendationSettings } from "@/config/recommendation-rules";
import { getServerHistoryRepository } from "@/server/history/server-history-repository";
import { createLiveRecruitmentEvidenceProvider } from "@/server/providers/recruitment/create-live-provider";
import { createConfiguredYouTubeProvider } from "@/server/providers/youtube/create-provider";
import { YouTubeProviderError } from "@/server/providers/youtube/provider-error";
import { AutomaticScoutingPipeline } from "@/server/scouting/automatic-scouting-pipeline";
import { loadAutomaticScoutingSafetyLimits } from "@/server/scouting/automatic-scouting-config";
import { saveAutomaticRunResult } from "@/server/scouting/automatic-run-result-store";
import { runFictionalAutomaticScouting } from "@/server/scouting/fictional-automatic-run";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const requestSchema = z.object({
  name: z.string().trim().min(1),
  category: z.string().trim().min(1),
  keywords: z.string().trim().min(1),
  targetRecommendedCount: z.number().int().min(1).max(500),
  maximumDaysSinceLatestUpload: z.number().int().min(42).max(56),
  minimumRecentAverageViews: z.number().nonnegative(),
  minimumRecentVideoCount: z.number().int().min(2),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  const input = await parseRequest(request);
  if (!input) return NextResponse.json({ message: "추천 실행 입력값이 올바르지 않습니다." }, { status: 400 });

  try {
    if (process.env.E2E_TEST_MODE === "1") {
      const runId = `automatic-${randomUUID()}`;
      const result = await runFictionalAutomaticScouting(
        getServerHistoryRepository(),
        runId,
        input.targetRecommendedCount,
      );
      saveAutomaticRunResult(result);
      return NextResponse.json({ runId: result.runId });
    }

    const provider = createConfiguredYouTubeProvider();
    const runId = `automatic-${randomUUID()}`;
    const pipeline = new AutomaticScoutingPipeline({
      discoveryProvider: provider,
      identityProvider: provider,
      evidenceProvider: provider,
      recruitmentEvidenceProvider: createLiveRecruitmentEvidenceProvider(),
      historyRepository: getServerHistoryRepository(),
    });
    const result = await pipeline.run({
      runId,
      query: input.keywords,
      category: input.category,
      targetRecommendedCount: input.targetRecommendedCount,
      safetyLimits: loadAutomaticScoutingSafetyLimits(),
      settings: {
        ...defaultRecommendationSettings,
        maximumDaysSinceLatestUpload: input.maximumDaysSinceLatestUpload,
        minimumRecentAverageViews: input.minimumRecentAverageViews,
        minimumRecentVideoCount: input.minimumRecentVideoCount,
        allowedCategories: [input.category],
      },
    });
    saveAutomaticRunResult(result);
    return NextResponse.json({ runId });
  } catch (error: unknown) {
    if (error instanceof YouTubeProviderError && error.category === "configuration") {
      return NextResponse.json({ message: "YouTube 공급자 설정을 확인해 주세요." }, { status: 503 });
    }
    return NextResponse.json({ message: "자동 스카우팅 실행을 완료하지 못했습니다." }, { status: 500 });
  }
}

async function parseRequest(request: NextRequest): Promise<z.infer<typeof requestSchema> | null> {
  try {
    const parsed = requestSchema.safeParse(await request.json() as unknown);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
