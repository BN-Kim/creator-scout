import { AdaptiveQuerySelector } from "@/server/discovery/adaptive-query-selector";
import type { DiscoveryStateRepository } from "@/server/discovery/discovery-state-repository";
import { InMemoryDiscoveryStateRepository } from "@/server/discovery/in-memory-discovery-state-repository";
import type { DiscoveryMode, DiscoveryQueryDelta } from "@/server/discovery/discovery-types";
import { createManualQueries, isApprovedCategory } from "@/server/discovery/discovery-taxonomy";
import { createHistoryRecord } from "@/server/history/history-record";
import type { HistoryRepository } from "@/server/history/history-repository";
import type { RecruitmentEvidenceProvider } from "@/server/providers/recruitment/provider-contract";
import { toStableHistoryLookupIdentity } from "@/server/providers/youtube/history-prechecked-evidence";
import type { YouTubeCandidateDiscoveryProvider, YouTubeEvidenceProvider, YouTubeIdentityProvider } from "@/server/providers/youtube/provider-contracts";
import { YouTubeProviderError } from "@/server/providers/youtube/provider-error";
import type { DiscoveredYouTubeCandidate, IdentityResolutionResult } from "@/server/providers/youtube/provider-types";
import { createVerificationEvidence } from "@/server/providers/youtube/verification-evidence";
import { youtubeEvidenceCollectionPolicy } from "@/config/youtube-evidence";
import { evaluateCreator } from "@/server/rules/evaluate-creator";
import { defaultAutomaticScoutingSafetyLimits, exhaustedDiscoveryQueryCooldownMs } from "@/server/scouting/automatic-scouting-config";
import { createCreatorInputFromYouTubeEvidence, type CreatorInputAssembler } from "@/server/scouting/creator-input-assembler";
import type {
  AutomaticScoutingFailure, AutomaticScoutingFailureStage, AutomaticScoutingRunRequest, AutomaticScoutingRunResult,
  AutomaticScoutingSafetyLimits, AutomaticScoutingStatistics, AutomaticScoutingStopReason,
} from "@/server/scouting/automatic-scouting-types";
import type { CreatorInput, EvaluatedCreator, RecruitmentEvidence } from "@/types/domain";

export interface AutomaticScoutingPipelineDependencies {
  discoveryProvider: YouTubeCandidateDiscoveryProvider;
  identityProvider: YouTubeIdentityProvider;
  evidenceProvider: YouTubeEvidenceProvider;
  historyRepository: HistoryRepository;
  discoveryStateRepository?: DiscoveryStateRepository;
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
    const deadlineAtMs = startedAtDate.getTime() + limits.maxRunDurationMs;
    const mode = resolveMode(request);
    const manualQueries = resolveManualQueries(request);
    const stateRepository = this.dependencies.discoveryStateRepository ?? new InMemoryDiscoveryStateRepository();
    const selector = new AdaptiveQuerySelector(stateRepository, {
      mode,
      manualQueries,
      ...(request.preferredCategory ?? request.category ? { preferredCategory: request.preferredCategory ?? request.category } : {}),
    }, this.now);
    selector.initialize();

    const statistics = createEmptyStatistics(request.targetRecommendedCount, mode);
    const results: EvaluatedCreator[] = [];
    const skips: AutomaticScoutingRunResult["skips"] = [];
    const failures: AutomaticScoutingFailure[] = [];
    const sameRunChannelIds = new Set<string>();
    const attemptedQueryKeys = new Set<string>();
    let providerFailures = 0;
    let stopReason: AutomaticScoutingStopReason = "source_exhausted";

    while (true) {
      const safetyReason = safetyStopReason(statistics, limits, providerFailures, this.now().getTime() - startedAtDate.getTime());
      if (safetyReason) { stopReason = safetyReason; break; }

      const queryState = selector.next(statistics.recommendationsFilled);
      if (!queryState) { stopReason = "source_exhausted"; break; }
      attemptedQueryKeys.add(queryState.normalizedKey);
      const remainingCandidateSlots = limits.maxScannedCandidates - statistics.discovered;
      const batchSize = Math.min(50, remainingCandidateSlots);
      const delta: DiscoveryQueryDelta = {};

      let page;
      try {
        page = await withinRunDeadline(
          () => this.dependencies.discoveryProvider.discoverCandidates({
            query: queryState.query,
            maxResults: batchSize,
            ...(queryState.continuationToken ? { pageToken: queryState.continuationToken } : {}),
          }),
          deadlineAtMs,
          this.now,
        );
        statistics.pagesScanned += 1;
      } catch (error: unknown) {
        if (error instanceof AutomaticScoutingDeadlineReachedError) {
          stopReason = "time_limit_reached";
          break;
        }
        failures.push(toFailure(error, "discovery", null));
        statistics.failed += 1;
        providerFailures += 1;
        stateRepository.setCooldown(queryState.normalizedKey, new Date(this.now().getTime() + 5 * 60_000).toISOString(), false, this.now().toISOString());
        if (error instanceof YouTubeProviderError && isRunWideDiscoveryFailure(error.category)) {
          stopReason = "provider_failure_limit_reached";
          break;
        }
        if (providerFailures >= limits.maxProviderFailures) { stopReason = "provider_failure_limit_reached"; break; }
        continue;
      }

      const candidates = page.candidates.slice(0, batchSize);
      let processedCandidates = 0;
      let pageInterrupted = false;
      let pageStopReason: AutomaticScoutingStopReason | null = null;
      for (const candidate of candidates) {
        const beforeCandidate = safetyStopReason(statistics, limits, providerFailures, this.now().getTime() - startedAtDate.getTime(), true);
        if (beforeCandidate) { pageStopReason = beforeCandidate; break; }
        processedCandidates += 1;
        statistics.discovered += 1;
        delta.candidatesScanned = (delta.candidatesScanned ?? 0) + 1;

        let identityResult: IdentityResolutionResult | null;
        try {
          identityResult = await withinRunDeadline(
            () => this.resolveCandidate(candidate, failures),
            deadlineAtMs,
            this.now,
          );
        } catch (error: unknown) {
          if (error instanceof AutomaticScoutingDeadlineReachedError) {
            pageInterrupted = true;
            pageStopReason = "time_limit_reached";
            break;
          }
          throw error;
        }
        if (!identityResult) {
          statistics.failed += 1; providerFailures += 1; delta.failed = (delta.failed ?? 0) + 1;
          if (providerFailures >= limits.maxProviderFailures) { pageStopReason = "provider_failure_limit_reached"; break; }
          continue;
        }

        const channelId = identityResult.identity.channelId;
        if (sameRunChannelIds.has(channelId)) {
          statistics.sameRunDuplicatesSkipped += 1; delta.duplicates = (delta.duplicates ?? 0) + 1;
          skips.push({ channelId, reason: "same_run", matchedHistoryRecordId: null });
          continue;
        }
        sameRunChannelIds.add(channelId);

        let historyMatch;
        try {
          historyMatch = this.dependencies.historyRepository.findDuplicate(toStableHistoryLookupIdentity(identityResult.identity));
        } catch (error: unknown) {
          failures.push(toFailure(error, "history_precheck", channelId));
          statistics.failed += 1; delta.failed = (delta.failed ?? 0) + 1;
          continue;
        }
        if (historyMatch) {
          statistics.priorHistorySkipped += 1; delta.duplicates = (delta.duplicates ?? 0) + 1;
          skips.push({ channelId, reason: "prior_history", matchedHistoryRecordId: historyMatch.id });
          continue;
        }
        delta.newIdentities = (delta.newIdentities ?? 0) + 1;

        let collectedEvidence;
        try {
          const channelResult = await withinRunDeadline(
            () => this.dependencies.evidenceProvider.getChannelEvidence(identityResult.identity),
            deadlineAtMs,
            this.now,
          );
          const videoResult = await withinRunDeadline(
            () => this.dependencies.evidenceProvider.getRecentVideoEvidence(identityResult.identity, {
              uploadsPlaylistId: channelResult.normalized.uploadsPlaylistId,
              maxResults: request.recentVideoLimit ?? youtubeEvidenceCollectionPolicy.maximumRecentUploads,
            }),
            deadlineAtMs,
            this.now,
          );
          collectedEvidence = {
            channel: channelResult.normalized,
            recentVideos: videoResult.normalized,
            verificationEvidence: createVerificationEvidence(
              channelResult.normalized,
              videoResult.normalized,
              this.now(),
              {
                maximumDaysSinceLatestUpload: request.settings.maximumDaysSinceLatestUpload,
                averageViewSampleSize: request.settings.extendedRecentAverageWindow,
              },
            ),
          };
        } catch (error: unknown) {
          if (error instanceof AutomaticScoutingDeadlineReachedError) {
            pageInterrupted = true;
            pageStopReason = "time_limit_reached";
            break;
          }
          failures.push(toFailure(error, "evidence_collection", channelId));
          statistics.failed += 1; providerFailures += 1; delta.failed = (delta.failed ?? 0) + 1;
          if (providerFailures >= limits.maxProviderFailures) { pageStopReason = "provider_failure_limit_reached"; break; }
          continue;
        }

        let recruitmentEvidence: RecruitmentEvidence | undefined;
        try {
          recruitmentEvidence = this.dependencies.recruitmentEvidenceProvider
            ? (await withinRunDeadline(
                () => this.dependencies.recruitmentEvidenceProvider!.collectEvidence({
                  channelId, channelName: identityResult.identity.channelName,
                  canonicalChannelUrl: identityResult.identity.canonicalChannelUrl,
                }),
                deadlineAtMs,
                this.now,
              )).normalized
            : undefined;
        } catch (error: unknown) {
          if (error instanceof AutomaticScoutingDeadlineReachedError) {
            pageInterrupted = true;
            pageStopReason = "time_limit_reached";
            break;
          }
          failures.push(toFailure(error, "recruitment_evidence", channelId));
          statistics.failed += 1; providerFailures += 1; delta.failed = (delta.failed ?? 0) + 1;
          if (providerFailures >= limits.maxProviderFailures) { pageStopReason = "provider_failure_limit_reached"; break; }
          continue;
        }

        let creatorInput: CreatorInput;
        try {
          creatorInput = this.assembleCreatorInput(identityResult.identity, collectedEvidence, {
            category: queryState.category,
            sourceQuery: candidate.sourceQuery,
          }, recruitmentEvidence);
        } catch (error: unknown) {
          failures.push(toFailure(error, "input_mapping", channelId));
          statistics.failed += 1; delta.failed = (delta.failed ?? 0) + 1;
          continue;
        }

        let evaluatedCreator: EvaluatedCreator;
        try {
          evaluatedCreator = { ...creatorInput, ...evaluateCreator(creatorInput, request.settings, [], [], this.now()) };
          statistics.evaluated += 1;
        } catch (error: unknown) {
          failures.push(toFailure(error, "evaluation", channelId));
          statistics.failed += 1; delta.failed = (delta.failed ?? 0) + 1;
          continue;
        }

        try {
          this.dependencies.historyRepository.addOrUpdate(createHistoryRecord(evaluatedCreator, request.runId));
        } catch (error: unknown) {
          failures.push(toFailure(error, "persistence", channelId));
          statistics.failed += 1; delta.failed = (delta.failed ?? 0) + 1;
          continue;
        }

        results.push(evaluatedCreator);
        statistics[evaluatedCreator.decision] += 1;
        delta[evaluatedCreator.decision] = (delta[evaluatedCreator.decision] ?? 0) + 1;
        if (evaluatedCreator.evidence.categoryFit === true) delta.categoryMatches = (delta.categoryMatches ?? 0) + 1;
        if (evaluatedCreator.evidence.recruitmentEvidence.koreanLanguageActivity.state === "likely") delta.koreanActivityMatches = (delta.koreanActivityMatches ?? 0) + 1;
        if (evaluatedCreator.evidence.emailClassification === "personal" && evaluatedCreator.evidence.emailVerificationState === "confirmed") delta.personalContacts = (delta.personalContacts ?? 0) + 1;
        statistics.recommendationsFilled = statistics.recommended;
        if (evaluatedCreator.decision === "recommended" && recruitmentEvidence?.exploratoryDiscoveryPhrases?.length) {
          stateRepository.upsertLearnedTerms(recruitmentEvidence.exploratoryDiscoveryPhrases, queryState.category, this.now().toISOString());
        }
      }

      const pageFullyProcessed = !pageInterrupted && processedCandidates === candidates.length;
      const persistedContinuation = pageFullyProcessed ? page.nextPageToken : queryState.continuationToken;
      const exhausted = pageFullyProcessed && (!page.nextPageToken || page.nextPageToken === queryState.continuationToken);
      stateRepository.recordPage(queryState.normalizedKey, persistedContinuation, exhausted, delta, this.now().toISOString());
      if (exhausted) stateRepository.setCooldown(
        queryState.normalizedKey,
        new Date(this.now().getTime() + exhaustedDiscoveryQueryCooldownMs).toISOString(),
        true,
        this.now().toISOString(),
      );
      if (queryState.origin === "learned") stateRepository.recordLearnedTermOutcome(queryState.normalizedKey, delta, this.now().toISOString());
      if (!exhausted) selector.allowContinuation({ ...queryState, continuationToken: page.nextPageToken });
      if (pageStopReason) { stopReason = pageStopReason; break; }
      if (statistics.recommended >= request.targetRecommendedCount) { stopReason = "target_reached"; break; }
    }

    statistics.stopReason = stopReason;
    statistics.recommendationsFilled = statistics.recommended;
    statistics.queriesAttempted = attemptedQueryKeys.size;
    return {
      runId: request.runId,
      status: failures.length > 0 ? "completed_with_failures" : "completed",
      startedAt: startedAtDate.toISOString(), completedAt: this.now().toISOString(), statistics, results, skips, failures,
    };
  }

  private async resolveCandidate(candidate: DiscoveredYouTubeCandidate, failures: AutomaticScoutingFailure[]): Promise<IdentityResolutionResult | null> {
    try { return await this.dependencies.identityProvider.resolveIdentity(candidate.identityInput); }
    catch (error: unknown) {
      if (error instanceof AutomaticScoutingDeadlineReachedError) throw error;
      failures.push(toFailure(error, "identity_resolution", candidate.channelId));
      return null;
    }
  }
}

function isRunWideDiscoveryFailure(category: YouTubeProviderError["category"]): boolean {
  return ["configuration", "quota_exceeded", "rate_limited", "unauthorized"].includes(category);
}

class AutomaticScoutingDeadlineReachedError extends Error {
  constructor() {
    super("Automatic scouting run deadline reached.");
    this.name = "AutomaticScoutingDeadlineReachedError";
  }
}

async function withinRunDeadline<T>(
  operation: () => Promise<T>,
  deadlineAtMs: number,
  now: () => Date,
): Promise<T> {
  const remainingMs = deadlineAtMs - now().getTime();
  if (remainingMs <= 0) throw new AutomaticScoutingDeadlineReachedError();

  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation(),
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new AutomaticScoutingDeadlineReachedError()), remainingMs);
      }),
    ]);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

function resolveMode(request: AutomaticScoutingRunRequest): DiscoveryMode {
  if (request.discoveryMode) return request.discoveryMode;
  return request.query?.trim() ? "manual_replace" : "automatic";
}

function resolveManualQueries(request: AutomaticScoutingRunRequest): string[] {
  return [...(request.manualQueries ?? []), ...(request.query?.trim() ? [request.query] : [])];
}

function safetyStopReason(statistics: AutomaticScoutingStatistics, limits: AutomaticScoutingSafetyLimits, providerFailures: number, elapsedMs: number, ignorePageLimit = false): AutomaticScoutingStopReason | null {
  if (statistics.recommended >= statistics.targetRecommendedCount) return "target_reached";
  if (elapsedMs >= limits.maxRunDurationMs) return "time_limit_reached";
  if (providerFailures >= limits.maxProviderFailures) return "provider_failure_limit_reached";
  if (statistics.discovered >= limits.maxScannedCandidates) return "candidate_limit_reached";
  if (!ignorePageLimit && statistics.pagesScanned >= limits.maxDiscoveryPages) return "page_limit_reached";
  return null;
}

function validateRequest(request: AutomaticScoutingRunRequest): AutomaticScoutingSafetyLimits {
  if (!request.runId.trim()) throw new Error("실행 ID는 필수입니다.");
  if (!Number.isInteger(request.targetRecommendedCount) || request.targetRecommendedCount < 1) throw new Error("추천 목표 수는 1 이상의 정수여야 합니다.");
  const mode = resolveMode(request);
  if (mode !== "automatic" && createManualQueries(resolveManualQueries(request), request.preferredCategory ?? request.category).length === 0) throw new Error("수동 발견 모드에는 유효한 검색어가 필요합니다.");
  if ((request.preferredCategory ?? request.category) && !isApprovedCategory(request.preferredCategory ?? request.category ?? "")) throw new Error("승인되지 않은 카테고리입니다.");
  const limits = { ...defaultAutomaticScoutingSafetyLimits, ...request.safetyLimits };
  for (const [name, value] of Object.entries(limits)) if (!Number.isInteger(value) || value < 1) throw new Error(`${name} 안전 한도는 1 이상의 정수여야 합니다.`);
  return limits;
}

function createEmptyStatistics(targetRecommendedCount: number, discoveryMode: DiscoveryMode): AutomaticScoutingStatistics {
  return {
    discoveryMode, queriesAttempted: 0, pagesScanned: 0, targetRecommendedCount, recommendationsFilled: 0,
    discovered: 0, priorHistorySkipped: 0, sameRunDuplicatesSkipped: 0, evaluated: 0,
    recommended: 0, hold: 0, excluded: 0, failed: 0, stopReason: "source_exhausted",
  };
}

function toFailure(error: unknown, stage: AutomaticScoutingFailureStage, candidateChannelId: string | null): AutomaticScoutingFailure {
  if (error instanceof YouTubeProviderError) return { stage, candidateChannelId, category: error.category, retryable: error.retryable, message: "YouTube 공급자 처리 중 오류가 발생했습니다." };
  return {
    stage, candidateChannelId, category: stage === "persistence" ? "storage" : "internal", retryable: stage === "persistence",
    message: stage === "persistence" ? "히스토리를 저장하지 못했습니다." : "자동 스카우팅 처리 중 오류가 발생했습니다.",
  };
}
