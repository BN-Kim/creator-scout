import type { CollectedYouTubeEvidence, ResolvedYouTubeIdentity } from "@/server/providers/youtube/provider-types";
import { applyRecruitmentEvidence } from "@/server/providers/recruitment/verification-evidence";
import type { CreatorInput, RecruitmentEvidence } from "@/types/domain";

export interface CreatorInputAssemblyContext {
  category: string;
  sourceQuery: string;
}

export type CreatorInputAssembler = (
  identity: ResolvedYouTubeIdentity,
  evidence: CollectedYouTubeEvidence,
  context: CreatorInputAssemblyContext,
  recruitmentEvidence?: RecruitmentEvidence,
) => CreatorInput;

export const createCreatorInputFromYouTubeEvidence: CreatorInputAssembler = (identity, evidence, context, recruitmentEvidence) => {
  const verifiedCategory = recruitmentEvidence?.categoryEvidence.verificationState === "confirmed"
    ? recruitmentEvidence.categoryEvidence.verifiedCategory
    : null;
  const verificationEvidence = recruitmentEvidence
    ? applyRecruitmentEvidence(evidence.verificationEvidence, recruitmentEvidence)
    : evidence.verificationEvidence;
  return {
    identity: {
    internalId: `youtube:${identity.channelId}`,
    channelName: evidence.channel.channelName,
    normalizedChannelName: normalizeChannelName(evidence.channel.channelName),
    confirmedAliases: [],
    canonicalChannelUrl: identity.canonicalChannelUrl,
    youtubeChannelId: identity.channelId,
    youtubeHandle: identity.handle,
    sourceUrls: [identity.canonicalChannelUrl],
    discoveryCategory: context.category,
    category: verifiedCategory ?? "미분류",
    identityVerificationState: "confirmed",
  },
  evidence: {
    ...verificationEvidence,
    categoryFit: verifiedCategory ? verifiedCategory === context.category : null,
  },
  mockScenario: `youtube_provider:${context.sourceQuery}`,
  manualCorrection: null,
  };
};

function normalizeChannelName(channelName: string): string {
  return channelName.trim().normalize("NFKC").toLocaleLowerCase("ko-KR").replace(/\s+/g, " ");
}
