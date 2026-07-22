import type { CollectedYouTubeEvidence, ResolvedYouTubeIdentity } from "@/server/providers/youtube/provider-types";
import type { CreatorInput } from "@/types/domain";

export interface CreatorInputAssemblyContext {
  category: string;
  sourceQuery: string;
}

export type CreatorInputAssembler = (
  identity: ResolvedYouTubeIdentity,
  evidence: CollectedYouTubeEvidence,
  context: CreatorInputAssemblyContext,
) => CreatorInput;

export const createCreatorInputFromYouTubeEvidence: CreatorInputAssembler = (identity, evidence, context) => ({
  identity: {
    internalId: `youtube:${identity.channelId}`,
    channelName: evidence.channel.channelName,
    normalizedChannelName: normalizeChannelName(evidence.channel.channelName),
    confirmedAliases: [],
    canonicalChannelUrl: identity.canonicalChannelUrl,
    youtubeChannelId: identity.channelId,
    youtubeHandle: identity.handle,
    sourceUrls: [identity.canonicalChannelUrl],
    category: context.category,
    identityVerificationState: "confirmed",
  },
  evidence: evidence.verificationEvidence,
  mockScenario: `youtube_provider:${context.sourceQuery}`,
  manualCorrection: null,
});

function normalizeChannelName(channelName: string): string {
  return channelName.trim().normalize("NFKC").toLocaleLowerCase("ko-KR").replace(/\s+/g, " ");
}
