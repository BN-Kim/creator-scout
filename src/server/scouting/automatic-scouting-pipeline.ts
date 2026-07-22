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
import { defaultAutomaticScoutingSafetyLimits } from "@/server/scouting/automatic-scouting-config";
import {
  createCreatorInputFromYouTubeEvidence,
  type CreatorInputAssembler,
} from "@/server/scouting/creator-input-assembler";
import type {
  AutomaticScoutingFailure,
  AutomaticScoutingFailureStage,
  AutomaticScoutingRunRequest,
  AutomaticScoutingRunResult,
  AutomaticScoutingSafetyLimits,
  AutomaticScoutingStatistics,
  AutomaticScoutingStopReason,
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
    const limits = validateRequest(request);
    const startedAtDate = this.now();
    const startedAt = startedAtDate.toISOString();
    const statistics = createEmptyStatistics(request.targetRecommendedCount);
    const results: EvaluatedCreator[] = [];
    const skips: AutomaticScoutingRunResult["skips"] = [];
    const failures: AutomaticScoutingFailure[] = [];
    const sameRunChannelIds = new Set<string>();
    const usedPageTokens = new Set<string>();
    let pageToken: string | undefined;
    let discoveryPages = 0;
    let providerFailures = 0;
    let stopReason: AutomaticScoutingStopReason = "source_exhausted";

    scouting: while (true) {
      const beforeDiscovery = safetyStopReason({
        statistics,
        limits,
        discoveryPages,
        providerFailures,
        elapsedMs: this.now().getTime() - startedAtDate.getTime(),
      });
      if (beforeDiscovery) {
        stopReason = beforeDiscovery;
        break;
      }

      const remainingRecommendationSlots = request.targetRecommendedCount - statistics.recommended;
      const remainingCandidateSlots = limits.maxScannedCandidates - statistics.discovered;
      const batchSize = Math.min(50, remainingRecommendationSlots, remainingCandidateSlots);
      let page;
      try {
        page = await this.dependencies.discoveryProvider.discoverCandidates({
          query: request.query,
          maxResults: batchSize,
          ...(pageToken ? { pageToken } : {}),
        });
        discoveryPages += 1;
      } catch (error: unknown) {
        failures.push(toFailure(error, "discovery", null));
        statistics.failed += 1;
        providerFailures += 1;
        stopReason = providerFailures >= limits.maxProviderFailures
          ? "provider_failure_limit_reached"
          : "source_exhausted";
        break;
      }

      const candidates = page.candidates.slice(0, batchSize);
      if (candidates.length === 0) {
        stopReason = "source_exhausted";
        break;
      }

      for (const candidate of candidates) {
        const beforeCandidate = safetyStopReason({
          statistics,
          limits,
          discoveryPages: 0,
          providerFailures,
          elapsedMs: this.now().getTime() - startedAtDate.getTime(),
          ignorePageLimit: true,
        });
        if (beforeCandidate) {
          stopReason = beforeCandidate;
          break scouting;
        }

        statistics.discovered += 1;
        const identityResult = await this.resolveCandidate(candidate, failures);
        if (!identityResult) {
          statistics.failed += 1;
          providerFailures += 1;
          if (providerFailures >= limits.maxProviderFailures) {
            stopReason = "provider_failure_limit_reached";
            break scouting;
          }
          continue;
        }

        const channelId = identityResult.identity.channelId;
        if (sameRunChannelIds.has(channelId)) {
          statistics.sameRunDuplicatesSkipped += 1;
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
          statistics.priorHistorySkipped += 1;
          skips.push({ channelId, reason: "prior_history", matchedHistoryRecordId: historyMatch.id });
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
          providerFailures += 1;
          if (providerFailures >= limits.maxProviderFailures) {
            stopReason = "provider_failure_limit_reached";
            break scouting;
          }
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
          providerFailures += 1;
          if (providerFailures >= limits.maxProviderFailures) {
            stopReason = "provider_failure_limit_reached";
            break scouting;
          }
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
        statistics.recommendationsFilled = statistics.recommended;
        if (statistics.recommended === request.targetRecommendedCount) {
          stopReason = "target_reached";
          break scouting;
        }
      }

      if (!page.nextPageToken || usedPageTokens.has(page.nextPageToken)) {
        stopReason = "source_exhausted";
        break;
      }
      usedPageTokens.add(page.nextPageToken);
      pageToken = page.nextPageToken;
    }

    statistics.stopReason = stopReason;
    statistics.recommendationsFilled = statistics.recommended;
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

interface SafetyState {
  statistics: AutomaticScoutingStatistics;
  limits: AutomaticScoutingSafetyLimits;
  discoveryPages: number;
  providerFailures: number;
  elapsedMs: number;
  ignorePageLimit?: boolean;
}

function safetyStopReason(state: SafetyState): AutomaticScoutingStopReason | null {
  if (state.statistics.recommended >= state.statistics.targetRecommendedCount) return "target_reached";
  if (state.providerFailures >= state.limits.maxProviderFailures) return "provider_failure_limit_reached";
  if (state.statistics.discovered >= state.limits.maxScannedCandidates) return "candidate_limit_reached";
  if (!state.ignorePageLimit && state.discoveryPages >= state.limits.maxDiscoveryPages) return "page_limit_reached";
  if (state.elapsedMs >= state.limits.maxRunDurationMs) return "time_limit_reached";
  return null;
}

function validateRequest(request: AutomaticScoutingRunRequest): AutomaticScoutingSafetyLimits {
  if (!request.runId.trim() || !request.query.trim() || !request.category.trim()) {
    throw new Error("실행 ID, 검색어, 카테고리는 필수입니다.");
  }
  if (!Number.isInteger(request.targetRecommendedCount) || request.targetRecommendedCount < 1) {
    throw new Error("추천 목표 수는 1 이상의 정수여야 합니다.");
  }
  const limits = { ...defaultAutomaticScoutingSafetyLimits, ...request.safetyLimits };
  for (const [name, value] of Object.entries(limits)) {
    if (!Number.isInteger(value) || value < 1) throw new Error(`${name} 안전 한도는 1 이상의 정수여야 합니다.`);
  }
  return limits;
}

function createEmptyStatistics(targetRecommendedCount: number): AutomaticScoutingStatistics {
  return {
    targetRecommendedCount,
    recommendationsFilled: 0,
    discovered: 0,
    priorHistorySkipped: 0,
    sameRunDuplicatesSkipped: 0,
    evaluated: 0,
    recommended: 0,
    hold: 0,
    excluded: 0,
    failed: 0,
    stopReason: "source_exhausted",
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
