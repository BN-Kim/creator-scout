import type { HistoryRepository } from "@/server/history/history-repository";
import type { YouTubeEvidenceProvider, YouTubeIdentityProvider } from "@/server/providers/youtube/provider-contracts";
import type { HistoryPrecheckedEvidenceOutcome, IdentityResolutionResult, ResolvedYouTubeIdentity, YouTubeIdentityInput } from "@/server/providers/youtube/provider-types";
import { createVerificationEvidence } from "@/server/providers/youtube/verification-evidence";
import type { CreatorIdentity } from "@/types/domain";

export interface HistoryPrecheckedEvidenceOptions {
  recentVideoLimit?: number;
  now?: Date;
}

export class HistoryPrecheckedYouTubeEvidenceCollector {
  constructor(
    private readonly identityProvider: YouTubeIdentityProvider,
    private readonly evidenceProvider: YouTubeEvidenceProvider,
    private readonly historyRepository: Pick<HistoryRepository, "findDuplicate">,
  ) {}

  async collect(
    input: YouTubeIdentityInput,
    options: HistoryPrecheckedEvidenceOptions = {},
  ): Promise<HistoryPrecheckedEvidenceOutcome> {
    const identityResult = await this.identityProvider.resolveIdentity(input);
    return this.collectResolved(identityResult, options);
  }

  async collectResolved(
    identityResult: IdentityResolutionResult,
    options: HistoryPrecheckedEvidenceOptions = {},
  ): Promise<HistoryPrecheckedEvidenceOutcome> {
    const historyMatch = this.historyRepository.findDuplicate(toStableHistoryLookupIdentity(identityResult.identity));
    if (historyMatch) {
      return {
        kind: "skipped_history",
        skipReason: "prior_history",
        identity: identityResult.identity,
        matchedHistoryRecordId: historyMatch.id,
        decision: null,
        evidence: null,
        rawIdentity: identityResult.raw,
      };
    }
    const channelResult = await this.evidenceProvider.getChannelEvidence(identityResult.identity);
    const recentVideoResult = await this.evidenceProvider.getRecentVideoEvidence(identityResult.identity, {
      uploadsPlaylistId: channelResult.normalized.uploadsPlaylistId,
      maxResults: options.recentVideoLimit ?? 10,
    });
    return {
      kind: "evidence_collected",
      identity: identityResult.identity,
      decision: null,
      evidence: {
        channel: channelResult.normalized,
        recentVideos: recentVideoResult.normalized,
        verificationEvidence: createVerificationEvidence(channelResult.normalized, recentVideoResult.normalized, options.now),
      },
      raw: {
        identity: identityResult.raw,
        channel: channelResult.raw,
        recentVideos: recentVideoResult.raw,
      },
    };
  }
}

export function toStableHistoryLookupIdentity(identity: ResolvedYouTubeIdentity): CreatorIdentity {
  return {
    internalId: `youtube:${identity.channelId}`,
    channelName: `youtube:${identity.channelId}`,
    normalizedChannelName: `youtube:${identity.channelId}`.toLowerCase(),
    confirmedAliases: [],
    canonicalChannelUrl: identity.canonicalChannelUrl,
    youtubeChannelId: identity.channelId,
    youtubeHandle: null,
    sourceUrls: [],
    category: "미분류",
    identityVerificationState: "confirmed",
  };
}
