import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { defaultRecommendationSettings } from "@/config/recommendation-rules";
import { getServerDiscoveryStateRepository, getServerHistoryRepository } from "@/server/history/server-history-repository";
import { discoveryTaxonomy, isApprovedCategory, isSafeDiscoveryQuery } from "@/server/discovery/discovery-taxonomy";
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
  name: z.string().trim().max(100).default(""),
  discoveryMode: z.enum(["automatic", "manual_replace", "manual_extend"]).default("automatic"),
  category: z.string().trim().default(""),
  keywords: z.string().trim().default(""),
  targetRecommendedCount: z.number().int().min(1).max(500),
  maximumDaysSinceLatestUpload: z.number().int().min(42).max(56).default(defaultRecommendationSettings.maximumDaysSinceLatestUpload),
  minimumRecentAverageViews: z.number().nonnegative().default(defaultRecommendationSettings.minimumRecentAverageViews),
  minimumRecentVideoCount: z.number().int().min(2).default(defaultRecommendationSettings.minimumRecentVideoCount),
}).superRefine((input, context) => {
  if (input.discoveryMode !== "automatic" && !input.keywords) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["keywords"], message: "수동 발견 모드에는 검색어가 필요합니다." });
  }
  if (input.keywords && input.keywords.split(/[\n,]/).some((keyword) => keyword.trim() && !isSafeDiscoveryQuery(keyword))) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["keywords"], message: "검색어에 허용되지 않는 값이 포함되어 있습니다." });
  }
  if (input.category && !isApprovedCategory(input.category)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["category"], message: "승인되지 않은 카테고리입니다." });
  }
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
        input.discoveryMode,
        input.keywords.split(/[\n,]/).map((value) => value.trim()).filter(Boolean),
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
      discoveryStateRepository: getServerDiscoveryStateRepository(),
    });
    const result = await pipeline.run({
      runId,
      discoveryMode: input.discoveryMode,
      manualQueries: input.keywords.split(/[\n,]/).map((value) => value.trim()).filter(Boolean),
      ...(input.category ? { preferredCategory: input.category } : {}),
      targetRecommendedCount: input.targetRecommendedCount,
      safetyLimits: loadAutomaticScoutingSafetyLimits(),
      settings: {
        ...defaultRecommendationSettings,
        maximumDaysSinceLatestUpload: input.maximumDaysSinceLatestUpload,
        minimumRecentAverageViews: input.minimumRecentAverageViews,
        minimumRecentVideoCount: input.minimumRecentVideoCount,
        allowedCategories: input.category ? [input.category] : discoveryTaxonomy.categories.map((category) => category.name),
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
