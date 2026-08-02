import { isPermanentHardExclusionReason } from "@/config/recommendation-rules";
import type { CreatorDecision, ReasonCode } from "@/types/domain";

const nominalEndings: ReadonlyArray<readonly [RegExp, string]> = [
  [/하지 않았습니다$/, "하지 않음"],
  [/않았습니다$/, "않음"],
  [/되었습니다$/, "됨"],
  [/했습니다$/, "함"],
  [/필요합니다$/, "필요함"],
  [/있습니다$/, "있음"],
  [/없습니다$/, "없음"],
  [/입니다$/, "임"],
  [/됩니다$/, "됨"],
  [/합니다$/, "함"],
];

const historyReasonLabels: Readonly<Record<ReasonCode, string>> = {
  prior_history_duplicate: "기존 히스토리 중복",
  same_run_duplicate: "실행 내 중복",
  user_corrected_invalid: "사용자 교정 제외",
  channel_not_found: "채널 신원 확인 실패",
  channel_url_unconfirmed: "채널 신원 확인 실패",
  channel_name_mismatch: "채널 신원 확인 실패",
  identity_unclear: "채널 신원 확인 실패",
  no_videos: "최소 업로드 미달",
  latest_upload_too_old: "최소 업로드 미달",
  insufficient_recent_activity: "최소 업로드 미달",
  insufficient_recent_video_count: "최소 업로드 미달",
  recent_views_below_threshold: "평균 조회수 미달",
  viral_video_distortion: "조회수 기준 부적합",
  category_mismatch: "카테고리 불일치",
  foreign_audience_heavy: "국내 활동 기준 미달",
  overseas_based: "국내 활동 기준 미달",
  celebrity_channel: "추천 대상 채널 유형 아님",
  official_channel: "추천 대상 채널 유형 아님",
  company_channel: "추천 대상 채널 유형 아님",
  corporate_channel: "추천 대상 채널 유형 아님",
  brand_channel: "추천 대상 채널 유형 아님",
  agency_affiliation: "조직 소속 확인",
  management_affiliation: "조직 소속 확인",
  mcn_affiliation: "조직 소속 확인",
  label_affiliation: "조직 소속 확인",
  company_email: "조직 연락처 확인",
  agency_email: "조직 연락처 확인",
  management_email: "조직 연락처 확인",
  mcn_email: "조직 연락처 확인",
  label_email: "조직 연락처 확인",
  missing_email: "개인 연락처 미확인",
  email_not_checked: "개인 연락처 미확인",
  email_ownership_unknown: "연락처 유형 미확인",
  affiliation_conflict: "소속 정보 충돌",
  missing_verification: "필수 근거 미확인",
  subscriber_threshold_not_configured: "구독자 기준 미사용",
  subscriber_below_target: "구독자 목표 범위 미달",
  reupload_channel: "재가공 채널",
  compilation_channel: "재가공 채널",
  too_large: "구독자 기준 초과",
  fit_score_below_threshold: "마케팅 적합도 미달",
  manual_decision_override: "마케터 수동 판정",
};

function toNominalEnding(sentence: string): string {
  for (const [pattern, replacement] of nominalEndings) {
    if (pattern.test(sentence)) return sentence.replace(pattern, replacement);
  }
  return sentence;
}

function relevantReasonCodes(reasonCodes: readonly ReasonCode[], decision: CreatorDecision): ReasonCode[] {
  if (decision === "recommended") return [];
  if (decision === "hold") {
    return reasonCodes.filter((code) =>
      !isPermanentHardExclusionReason(code)
      && code !== "subscriber_threshold_not_configured"
      && code !== "fit_score_below_threshold");
  }
  const excludedDiagnosticReasons: ReadonlySet<ReasonCode> = new Set([
    "latest_upload_too_old",
    "insufficient_recent_activity",
    "insufficient_recent_video_count",
    "recent_views_below_threshold",
    "viral_video_distortion",
    "subscriber_below_target",
    "too_large",
    "fit_score_below_threshold",
    "manual_decision_override",
  ]);
  return reasonCodes.filter((code) => isPermanentHardExclusionReason(code) || excludedDiagnosticReasons.has(code));
}

export function formatHistoryReasonLines(
  explanation: string,
  reasonCodes: readonly ReasonCode[] = [],
  decision?: CreatorDecision,
): string[] {
  if (decision === "recommended") return reasonCodes.includes("manual_decision_override")
    ? ["마케터 수동 추천"]
    : ["추천 기준 충족"];

  const fixedLabels = relevantReasonCodes(reasonCodes, decision ?? "excluded")
    .map((code) => historyReasonLabels[code]);
  const uniqueLabels = [...new Set(fixedLabels)];
  if (uniqueLabels.length > 0) return uniqueLabels;

  return explanation
    .split(/\.\s*/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0)
    .map(toNominalEnding);
}
