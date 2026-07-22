import type { RecommendationSettings, VerificationEvidence } from "@/types/domain";

export interface TrafficEvaluation { average: number | null; complete: boolean; viralDistortion: boolean; belowThreshold: boolean; }

export function evaluateRecentTraffic(evidence: VerificationEvidence, settings: RecommendationSettings): TrafficEvaluation {
  if (evidence.viralVideoDistortionRisk === true) return { average: evidence.recentAverageViews, complete: true, viralDistortion: true, belowThreshold: false };
  const counts = evidence.recentViewCounts;
  if (!counts || counts.length === 0) return { average: evidence.recentAverageViews, complete: false, viralDistortion: false, belowThreshold: false };
  const sample = counts.slice(0, settings.extendedRecentAverageWindow);
  const average = sample.reduce((sum, value) => sum + value, 0) / sample.length;
  const sorted = [...sample].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
  const viralDistortion = sample.length >= 3 && median > 0 && Math.max(...sample) >= median * 5;
  return { average, complete: sample.length >= settings.defaultRecentAverageWindow, viralDistortion, belowThreshold: average < settings.minimumRecentAverageViews };
}
