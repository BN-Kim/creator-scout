import type { VerificationEvidence } from "@/types/domain";

export type YouTubeIdentityInput =
  | { kind: "channel_id"; value: string }
  | { kind: "handle"; value: string }
  | { kind: "url"; value: string };

export interface CandidateDiscoveryRequest {
  query: string;
  maxResults: number;
  pageToken?: string;
}

export interface DiscoveredYouTubeCandidate {
  channelId: string;
  discoveredTitle: string | null;
  identityInput: YouTubeIdentityInput;
  sourceQuery: string;
}

export interface CandidateDiscoveryResult<TRaw = unknown> {
  candidates: DiscoveredYouTubeCandidate[];
  nextPageToken: string | null;
  raw: TRaw;
}

export type IdentityResolutionMethod = "channel_id" | "handle" | "channel_url" | "handle_url" | "username_url";

export interface ResolvedYouTubeIdentity {
  channelId: string;
  handle: string | null;
  canonicalChannelUrl: string;
  channelName: string;
  resolvedFrom: IdentityResolutionMethod;
}

export interface IdentityResolutionResult<TRaw = unknown> {
  identity: ResolvedYouTubeIdentity;
  raw: TRaw;
}

export interface NormalizedChannelEvidence {
  channelId: string;
  channelName: string;
  handle: string | null;
  canonicalChannelUrl: string;
  subscriberCount: number | null;
  subscriberCountHidden: boolean;
  publicVideoCount: number | null;
  channelPublishedAt: string | null;
  country: string | null;
  uploadsPlaylistId: string | null;
}

export interface ChannelEvidenceResult<TRaw = unknown> {
  normalized: NormalizedChannelEvidence;
  raw: TRaw;
}

export type VideoDurationClass = "shorts_length" | "long_form_length" | "unknown";

export interface NormalizedVideoEvidence {
  videoId: string;
  publishedAt: string | null;
  viewCount: number | null;
  durationSeconds: number | null;
  durationClass: VideoDurationClass;
}

export interface RecentVideoEvidence {
  videos: NormalizedVideoEvidence[];
  shortsLengthSamples: NormalizedVideoEvidence[];
  longFormLengthSamples: NormalizedVideoEvidence[];
  unknownDurationSamples: NormalizedVideoEvidence[];
  unavailableVideoIds: string[];
}

export interface RecentVideoEvidenceResult<TRaw = unknown> {
  normalized: RecentVideoEvidence;
  raw: TRaw;
}

export interface RecentVideoRequest {
  uploadsPlaylistId: string | null;
  maxResults: number;
}

export interface CollectedYouTubeEvidence {
  channel: NormalizedChannelEvidence;
  recentVideos: RecentVideoEvidence;
  verificationEvidence: VerificationEvidence;
}

export interface RawCollectedYouTubeEvidence {
  identity: unknown;
  channel: unknown;
  recentVideos: unknown;
}

export type HistoryPrecheckedEvidenceOutcome =
  | {
      kind: "skipped_history";
      skipReason: "prior_history";
      identity: ResolvedYouTubeIdentity;
      matchedHistoryRecordId: string;
      decision: null;
      evidence: null;
      rawIdentity: unknown;
    }
  | {
      kind: "evidence_collected";
      identity: ResolvedYouTubeIdentity;
      decision: null;
      evidence: CollectedYouTubeEvidence;
      raw: RawCollectedYouTubeEvidence;
    };
