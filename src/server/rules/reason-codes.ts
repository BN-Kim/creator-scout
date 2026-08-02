import { isPermanentHardExclusionReason } from "@/config/recommendation-rules";
import type { ReasonCode } from "@/types/domain";

export const reasonExplanations: Record<ReasonCode, string> = {
  prior_history_duplicate: "기존 히스토리에 이미 등록된 크리에이터입니다.", same_run_duplicate: "이번 추천 실행에서 이미 처리된 크리에이터입니다.", user_corrected_invalid: "사용자 교정에 따라 제외되었습니다.",
  channel_not_found: "YouTube 채널이 존재하지 않는 것으로 확인되어 제외되었습니다.", channel_url_unconfirmed: "확인된 YouTube 채널 URL을 확보하지 못해 제외되었습니다.", channel_name_mismatch: "채널명과 크리에이터 신원이 일치하지 않아 제외되었습니다.", identity_unclear: "크리에이터 신원을 명확히 확인하지 못해 제외되었습니다.",
  no_videos: "게시된 영상이 없어 제외되었습니다.", latest_upload_too_old: "최근 업로드가 허용 활동 기간을 초과했습니다.", insufficient_recent_activity: "최근 활동이 충분하지 않습니다.", insufficient_recent_video_count: "최근 영상 수가 최소 기준에 미달합니다.",
  recent_views_below_threshold: "최근 조회 성과가 도달력 기준에 미달합니다.", viral_video_distortion: "한 개 영상에 조회수가 편중되어 안정성 점수가 감점되었습니다.", category_mismatch: "요청한 카테고리와 일치하지 않아 제외되었습니다.",
  foreign_audience_heavy: "해외 시청자 비중이 높은 것으로 확인되어 제외되었습니다.", overseas_based: "해외 기반 크리에이터로 확인되어 제외되었습니다.", celebrity_channel: "연예인 또는 공인 채널로 확인되어 제외되었습니다.", official_channel: "공식 채널로 확인되어 제외되었습니다.",
  company_channel: "회사 채널로 확인되어 제외되었습니다.", corporate_channel: "법인 채널로 확인되어 제외되었습니다.", brand_channel: "브랜드 채널로 확인되어 제외되었습니다.", agency_affiliation: "소속사 운영 또는 소속이 확인되어 제외되었습니다.", management_affiliation: "매니지먼트 소속이 확인되어 제외되었습니다.", mcn_affiliation: "MCN 소속이 확인되어 제외되었습니다.", label_affiliation: "레이블 소속이 확인되어 제외되었습니다.",
  company_email: "회사 이메일이 확인되어 제외되었습니다.", agency_email: "소속사 또는 에이전시 이메일이 확인되어 제외되었습니다.", management_email: "매니지먼트 이메일이 확인되어 제외되었습니다.", mcn_email: "MCN 이메일이 확인되어 제외되었습니다.", label_email: "레이블 또는 대표 조직의 이메일이 확인되어 제외되었습니다.",
  missing_email: "개인 연락처가 확인되지 않아 보류되었습니다.", email_not_checked: "개인 연락처를 아직 확인하지 않아 보류되었습니다.", email_ownership_unknown: "연락처 소유 유형이 명확하지 않아 보류되었습니다.", affiliation_conflict: "소속 관계 근거가 서로 충돌해 보류되었습니다.", missing_verification: "확인되지 않은 필수 근거가 있습니다.", subscriber_threshold_not_configured: "구독자 기준이 설정되지 않아 구독자 수는 판정에 사용하지 않았습니다.", subscriber_below_target: "구독자 수가 설정된 캠페인 목표 범위보다 적습니다.",
  reupload_channel: "재업로드 채널로 확인되어 제외되었습니다.", compilation_channel: "모음 또는 콘텐츠 팜 채널로 확인되어 제외되었습니다.", too_large: "구독자 수가 설정된 캠페인 목표 범위를 초과합니다.", fit_score_below_threshold: "확인된 마케팅 적합도가 보류 가능한 최소 점수보다 낮아 제외되었습니다.", manual_decision_override: "마케터 검토에 따라 판정이 수동 변경되었습니다.",
};

export function decisionReasonTexts(
  decision: "recommended" | "hold" | "excluded",
  reasonCodes: ReasonCode[],
  missingFields: string[],
  fitScore?: number,
  recommendationThreshold?: number,
): string[] {
  if (decision === "recommended") {
    return [`마케팅 적합도 ${fitScore ?? recommendationThreshold ?? 0}점으로 추천 기준을 충족했습니다.`];
  }
  if (decision === "excluded") {
    return reasonCodes.filter((code) => isPermanentHardExclusionReason(code) || code === "fit_score_below_threshold")
      .map((code) => reasonExplanations[code]);
  }
  const scoreText = fitScore === undefined
    ? []
    : [`마케팅 적합도 ${fitScore}점이며 추천 기준 ${recommendationThreshold ?? 70}점 또는 필수 검증을 아직 충족하지 못했습니다.`];
  const reasons = reasonCodes.filter((code) =>
    !isPermanentHardExclusionReason(code)
    && !["missing_verification", "subscriber_threshold_not_configured", "fit_score_below_threshold"].includes(code))
    .map((code) => reasonExplanations[code]);
  return [...scoreText, ...reasons, ...missingFields.map((field) => `${field} 확인이 필요합니다.`)];
}

export function uncheckedEvidenceTexts(missingFields: string[]): string[] {
  return missingFields.length ? missingFields : ["없음"];
}

export const decisionLabels = { recommended: "추천", hold: "보류", excluded: "제외" } as const;
