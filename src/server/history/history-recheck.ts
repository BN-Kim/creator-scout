import { isPermanentHardExclusionReason, legacyRecommendationRuleVersion } from "@/config/recommendation-rules";
import type { HistoryRecord } from "@/types/domain";

export function shouldReevaluateHistoryRecord(
  record: HistoryRecord,
  activeRuleVersion: string,
  now: Date,
): boolean {
  if (record.decisionSource === "manual" || record.manualCorrection) return false;
  if (record.finalDecision === "recommended") return false;
  if (record.reasonCodes.some(isPermanentHardExclusionReason)) return false;
  if ((record.ruleVersion || legacyRecommendationRuleVersion) !== activeRuleVersion) return true;
  return record.recheckAt !== null && Date.parse(record.recheckAt) <= now.getTime();
}
