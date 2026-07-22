import type { ReasonCode } from "@/types/domain";

export const reasonExplanations: Record<ReasonCode, string> = {
  prior_history_duplicate: "기존 히스토리에 이미 등록된 크리에이터입니다.", same_run_duplicate: "이번 추천 실행에서 이미 처리된 크리에이터입니다.", user_corrected_invalid: "사용자 교정에 따라 제외되었습니다.",
  channel_not_found: "YouTube 채널이 존재하지 않는 것으로 확인되어 제외되었습니다.", channel_url_unconfirmed: "확인된 YouTube 채널 URL을 확보하지 못해 제외되었습니다.", channel_name_mismatch: "채널명과 크리에이터 신원이 일치하지 않아 제외되었습니다.", identity_unclear: "크리에이터 신원을 명확히 확인하지 못해 제외되었습니다.",
  no_videos: "게시된 영상이 없어 제외되었습니다.", latest_upload_too_old: "최근 업로드가 허용 활동 기간을 초과해 제외되었습니다.", insufficient_recent_activity: "최근 활동이 충분하지 않아 제외되었습니다.", insufficient_recent_video_count: "최근 영상 수가 최소 기준에 미달해 제외되었습니다.",
  recent_views_below_threshold: "최근 평균 조회수가 기준에 미달해 제외되었습니다.", viral_video_distortion: "한 개의 바이럴 영상이 평균 조회수를 과도하게 왜곡해 제외되었습니다.", category_mismatch: "요청한 카테고리와 일치하지 않아 제외되었습니다.",
  foreign_audience_heavy: "해외 시청자 비중이 높은 것으로 확인되어 제외되었습니다.", overseas_based: "해외 기반 크리에이터로 확인되어 제외되었습니다.", celebrity_channel: "연예인 또는 공인 채널로 확인되어 제외되었습니다.", official_channel: "공식 채널로 확인되어 제외되었습니다.",
  company_channel: "회사 채널로 확인되어 제외되었습니다.", corporate_channel: "법인 채널로 확인되어 제외되었습니다.", brand_channel: "브랜드 채널로 확인되어 제외되었습니다.", agency_affiliation: "소속사 운영 또는 소속이 확인되어 제외되었습니다.", management_affiliation: "매니지먼트 소속이 확인되어 제외되었습니다.", mcn_affiliation: "MCN 소속이 확인되어 제외되었습니다.", label_affiliation: "레이블 소속이 확인되어 제외되었습니다.",
  company_email: "회사 이메일이 확인되어 제외되었습니다.", agency_email: "소속사 또는 에이전시 이메일이 확인되어 제외되었습니다.", management_email: "매니지먼트 이메일이 확인되어 제외되었습니다.", mcn_email: "MCN 이메일이 확인되어 제외되었습니다.", label_email: "레이블 또는 대표 조직의 이메일이 확인되어 제외되었습니다.",
  missing_email: "개인 연락처가 확인되지 않아 보류되었습니다.", email_not_checked: "개인 연락처를 아직 확인하지 않아 보류되었습니다.", email_ownership_unknown: "연락처 소유 유형이 명확하지 않아 보류되었습니다.", affiliation_conflict: "소속 관계 근거가 서로 충돌해 보류되었습니다.", missing_verification: "확인되지 않은 필수 근거가 있습니다.", subscriber_threshold_not_configured: "구독자 기준이 설정되지 않아 구독자 수는 판정에 사용하지 않았습니다.",
  reupload_channel: "재업로드 채널로 확인되어 제외되었습니다.", compilation_channel: "모음 또는 콘텐츠 팜 채널로 확인되어 제외되었습니다.", too_large: "설정된 최대 구독자 기준을 초과해 제외되었습니다.",
};

const holdReasonCodes = new Set<ReasonCode>([
  "missing_email", "email_not_checked", "email_ownership_unknown", "affiliation_conflict", "missing_verification",
]);

export function decisionReasonTexts(
  decision: "recommended" | "hold" | "excluded",
  reasonCodes: ReasonCode[],
  missingFields: string[],
): string[] {
  if (decision === "recommended") return ["모든 필수 검증 조건을 충족했습니다."];
  if (decision === "excluded") {
    return reasonCodes.filter((code) => !holdReasonCodes.has(code) && code !== "subscriber_threshold_not_configured")
      .map((code) => reasonExplanations[code]);
  }
  const reasons = reasonCodes.filter((code) => holdReasonCodes.has(code) && code !== "missing_verification")
    .map((code) => reasonExplanations[code]);
  return [...reasons, ...missingFields.map((field) => `${field} 확인이 필요합니다.`)];
}

export function uncheckedEvidenceTexts(missingFields: string[]): string[] {
  return missingFields.length ? missingFields : ["없음"];
}

export const decisionLabels = { recommended: "추천", hold: "보류", excluded: "제외" } as const;
