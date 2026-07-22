import type { DiscoveryQueryState, QueryQualityScore } from "@/server/discovery/discovery-types";

export const minimumProvenQuerySample = 10;

export function scoreDiscoveryQuery(state: DiscoveryQueryState): QueryQualityScore {
  const sampleSize = state.candidatesScanned;
  if (sampleSize === 0) return { score: 0, sampleSize, proven: false };
  const ratio = (value: number): number => value / sampleSize;
  const scannedPerRecommendation = state.recommended > 0 ? sampleSize / state.recommended : sampleSize;
  const score = 100 * (
    ratio(state.recommended) * 3
    + ratio(state.newIdentities) * 1.5
    + ratio(state.categoryMatches)
    + ratio(state.koreanActivityMatches)
    + ratio(state.personalContacts)
    - ratio(state.duplicates) * 1.5
    - ratio(state.excluded) * 1.25
    - ratio(state.failed) * 1.5
    - Math.min(scannedPerRecommendation / 50, 1)
  );
  return { score: Math.round(score * 100) / 100, sampleSize, proven: sampleSize >= minimumProvenQuerySample };
}
