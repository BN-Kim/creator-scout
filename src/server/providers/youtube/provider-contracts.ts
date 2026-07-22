import type {
  CandidateDiscoveryRequest,
  CandidateDiscoveryResult,
  ChannelEvidenceResult,
  IdentityResolutionResult,
  RecentVideoEvidenceResult,
  RecentVideoRequest,
  ResolvedYouTubeIdentity,
  YouTubeIdentityInput,
} from "@/server/providers/youtube/provider-types";

export interface YouTubeCandidateDiscoveryProvider {
  discoverCandidates(request: CandidateDiscoveryRequest): Promise<CandidateDiscoveryResult>;
}

export interface YouTubeIdentityProvider {
  resolveIdentity(input: YouTubeIdentityInput): Promise<IdentityResolutionResult>;
}

export interface YouTubeEvidenceProvider {
  getChannelEvidence(identity: ResolvedYouTubeIdentity): Promise<ChannelEvidenceResult>;
  getRecentVideoEvidence(identity: ResolvedYouTubeIdentity, request: RecentVideoRequest): Promise<RecentVideoEvidenceResult>;
}
