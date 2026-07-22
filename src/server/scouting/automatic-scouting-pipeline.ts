import { createHistoryRecord } from "@/server/history/history-record";
import type { HistoryRepository } from "@/server/history/history-repository";
import type { RecruitmentEvidenceProvider } from "@/server/providers/recruitment/provider-contract";
import { toStableHistoryLookupIdentity } from "@/server/providers/youtube/history-prechecked-evidence";
import type {
  YouTubeCandidateDiscoveryProvider,
  YouTubeEvidenceProvider,
  YouTubeIdentityProvider,
} from "@/server/providers/youtube/provider-contracts";
import { YouTubeProviderError } from "@/server/providers/youtube/provider-error";
import type { DiscoveredYouTubeCandidate, IdentityResolutionResult } from "@/server/providers/youtube/provider-types";
import { createVerificationEvidence } from "@/server/providers/youtube/verification-evidence";
import { evaluateCreator } from "@/server/rules/evaluate-creator";
import {
  createCreatorInputFromYouTubeEvidence,
  type CreatorInputAssembler,
} from "@/server/scouting/creator-input-assembler";
import type {
  AutomaticScoutingFailure,
  AutomaticScoutingFailureStage,
  AutomaticScoutingRunRequest,
  AutomaticScoutingRunResult,
  AutomaticScoutingStatistics,
} from "@/server/scouting/automatic-scouting-types";
import type { CreatorInput, EvaluatedCreator } from "@/types/domain";

export interface AutomaticScoutingPipelineDependencies {
  discoveryProvider: YouTubeCandidateDiscoveryProvider;
  identityProvider: YouTubeIdentityProvider;
  evidenceProvider: YouTubeEvidenceProvider;
  historyRepository: HistoryRepository;
  recruitmentEvidenceProvider?: RecruitmentEvidenceProvider;
  assembleCreatorInput?: CreatorInputAssembler;
  now?: () => Date;
}

export class AutomaticScoutingPipeline {
  private readonly assembleCreatorInput: CreatorInputAssembler;
  private readonly now: () => Date;

  constructor(private readonly dependencies: AutomaticScoutingPipelineDependencies) {
    this.assembleCreatorInput = dependencies.assembleCreatorInput ?? createCreatorInputFromYouTubeEvidence;
    this.now = dependencies.now ?? (() => new Date());
  }

  async run(request: AutomaticScoutingRunRequest): Promise<AutomaticScoutingRunResult> {
    validateRequest(request);
    const startedAt = this.now().toISOString();
    const statistics = createEmptyStatistics();
    const results: EvaluatedCreator[] = [];
    const skips: AutomaticScoutingRunResult["skips"] = [];
    const failures: AutomaticScoutingFailure[] = [];
    const candidates = await this.discoverCandidateBatch(request, failures);
    statistics.discovered = candidates.length;
    statistics.failed = failures.length;
    const sameRunChannelIds = new Set<string>();

    for (const candidate of candidates) {
      const identityResult = await this.resolveCandidate(candidate, failures);
      if (!identityResult) {
        statistics.failed += 1;
        continue;
      }

      const channelId = identityResult.identity.channelId;
      if (sameRunChannelIds.has(channelId)) {
        statistics.skippedDuplicates += 1;
        statistics.skippedSameRun += 1;
        skips.push({ channelId, reason: "same_run", matchedHistoryRecordId: null });
        continue;
      }
      sameRunChannelIds.add(channelId);

      let historyMatch;
      try {
        historyMatch = this.dependencies.historyRepository.findDuplicate(toStableHistoryLookupIdentity(identityResult.identity));
      } catch (error: unknown) {
        failures.push(toFailure(error, "history_precheck", channelId));
        statistics.failed += 1;
        continue;
      }

      if (historyMatch) {
        statistics.skippedDuplicates += 1;
        statistics.skippedPriorHistory += 1;
        skips.push({
          channelId,
          reason: "prior_history",
          matchedHistoryRecordId: historyMatch.id,
        });
        continue;
      }

      let collectedEvidence;
      try {
        const channelResult = await this.dependencies.evidenceProvider.getChannelEvidence(identityResult.identity);
        const recentVideoResult = await this.dependencies.evidenceProvider.getRecentVideoEvidence(identityResult.identity, {
          uploadsPlaylistId: channelResult.normalized.uploadsPlaylistId,
          maxResults: request.recentVideoLimit ?? 10,
        });
        collectedEvidence = {
          channel: channelResult.normalized,
          recentVideos: recentVideoResult.normalized,
          verificationEvidence: createVerificationEvidence(
            channelResult.normalized,
            recentVideoResult.normalized,
            this.now(),
          ),
        };
      } catch (error: unknown) {
        failures.push(toFailure(error, "evidence_collection", channelId));
        statistics.failed += 1;
        continue;
      }

      let recruitmentEvidence;
      try {
        recruitmentEvidence = this.dependencies.recruitmentEvidenceProvider
          ? (await this.dependencies.recruitmentEvidenceProvider.collectEvidence({
              channelId: identityResult.identity.channelId,
              channelName: identityResult.identity.channelName,
              canonicalChannelUrl: identityResult.identity.canonicalChannelUrl,
            })).normalized
          : undefined;
      } catch (error: unknown) {
        failures.push(toFailure(error, "recruitment_evidence", channelId));
        statistics.failed += 1;
        continue;
      }

      let creatorInput: CreatorInput;
      try {
        creatorInput = this.assembleCreatorInput(identityResult.identity, collectedEvidence, {
          category: request.category,
          sourceQuery: candidate.sourceQuery,
        }, recruitmentEvidence);
      } catch (error: unknown) {
        failures.push(toFailure(error, "input_mapping", channelId));
        statistics.failed += 1;
        continue;
      }

      let evaluatedCreator: EvaluatedCreator;
      try {
        const evaluation = evaluateCreator(creatorInput, request.settings, [], [], this.now());
        evaluatedCreator = { ...creatorInput, ...evaluation };
        statistics.evaluated += 1;
      } catch (error: unknown) {
        failures.push(toFailure(error, "evaluation", channelId));
        statistics.failed += 1;
        continue;
      }

      try {
        this.dependencies.historyRepository.addOrUpdate(createHistoryRecord(evaluatedCreator, request.runId));
      } catch (error: unknown) {
        failures.push(toFailure(error, "persistence", channelId));
        statistics.failed += 1;
        continue;
      }

      results.push(evaluatedCreator);
      statistics[evaluatedCreator.decision] += 1;
    }

    return {
      runId: request.runId,
      status: failures.length > 0 ? "completed_with_failures" : "completed",
      startedAt,
      completedAt: this.now().toISOString(),
      statistics,
      results,
      skips,
      failures,
    };
  }

  private async discoverCandidateBatch(
    request: AutomaticScoutingRunRequest,
    failures: AutomaticScoutingFailure[],
  ): Promise<DiscoveredYouTubeCandidate[]> {
    const candidates: DiscoveredYouTubeCandidate[] = [];
    const usedPageTokens = new Set<string>();
    let pageToken: string | undefined;

    while (candidates.length < request.targetCount) {
      try {
        const page = await this.dependencies.discoveryProvider.discoverCandidates({
          query: request.query,
          maxResults: Math.min(50, request.targetCount - candidates.length),
          ...(pageToken ? { pageToken } : {}),
        });
        candidates.push(...page.candidates.slice(0, request.targetCount - candidates.length));
        if (page.candidates.length === 0 || !page.nextPageToken || usedPageTokens.has(page.nextPageToken)) break;
        usedPageTokens.add(page.nextPageToken);
        pageToken = page.nextPageToken;
      } catch (error: unknown) {
        failures.push(toFailure(error, "discovery", null));
        break;
      }
    }
    return candidates;
  }

  private async resolveCandidate(
    candidate: DiscoveredYouTubeCandidate,
    failures: AutomaticScoutingFailure[],
  ): Promise<IdentityResolutionResult | null> {
    try {
      return await this.dependencies.identityProvider.resolveIdentity(candidate.identityInput);
    } catch (error: unknown) {
      failures.push(toFailure(error, "identity_resolution", candidate.channelId));
      return null;
    }
  }
}

function validateRequest(request: AutomaticScoutingRunRequest): void {
  if (!request.runId.trim() || !request.query.trim() || !request.category.trim()) {
    throw new Error("실행 ID, 검색어, 카테고리는 필수입니다.");
  }
  if (!Number.isInteger(request.targetCount) || request.targetCount < 1) {
    throw new Error("목표 크리에이터 수는 1 이상의 정수여야 합니다.");
  }
}

function createEmptyStatistics(): AutomaticScoutingStatistics {
  return {
    discovered: 0,
    skippedDuplicates: 0,
    skippedPriorHistory: 0,
    skippedSameRun: 0,
    evaluated: 0,
    recommended: 0,
    hold: 0,
    excluded: 0,
    failed: 0,
  };
}

function toFailure(
  error: unknown,
  stage: AutomaticScoutingFailureStage,
  candidateChannelId: string | null,
): AutomaticScoutingFailure {
  if (error instanceof YouTubeProviderError) {
    return {
      stage,
      candidateChannelId,
      category: error.category,
      retryable: error.retryable,
      message: "YouTube 공급자 처리 중 오류가 발생했습니다.",
    };
  }
  return {
    stage,
    candidateChannelId,
    category: stage === "persistence" ? "storage" : "internal",
    retryable: stage === "persistence",
    message: stage === "persistence" ? "히스토리를 저장하지 못했습니다." : "자동 스카우팅 처리 중 오류가 발생했습니다.",
  };
}
