import { findHistoryMatch, findSameRunMatch } from "@/server/history/history-matcher";
import { classifyYoutubeUrl } from "@/server/history/url-classifier";
import { decisionReasonTexts, reasonExplanations } from "@/server/rules/reason-codes";
import { evaluateRecentTraffic } from "@/server/rules/recent-traffic";
import type { CreatorInput, EvaluationResult, HistoryRecord, ReasonCode, RecommendationSettings } from "@/types/domain";

const emailExclusions: Partial<Record<string, ReasonCode>> = { company: "company_email", agency: "agency_email", management: "management_email", mcn: "mcn_email", label: "label_email" };

export function evaluateCreator(input: CreatorInput, settings: RecommendationSettings, history: HistoryRecord[], sameRun: CreatorInput["identity"][], now = new Date()): EvaluationResult {
  const passed: string[] = [], failed: string[] = [], warnings: string[] = [], missing: string[] = [], reasons: ReasonCode[] = [];
  const historyMatch = findHistoryMatch(input.identity, history);
  if (historyMatch) reasons.push("prior_history_duplicate");
  const sameRunMatch = findSameRunMatch(input.identity, sameRun);
  if (sameRunMatch) reasons.push("same_run_duplicate");
  if (input.manualCorrection) reasons.push("user_corrected_invalid");

  const e = input.evidence;
  const addHard = (condition: boolean, code: ReasonCode, label: string): void => { if (condition) { reasons.push(code); failed.push(label); } else passed.push(label); };
  addHard(e.channelExists === false, "channel_not_found", "채널 존재");
  if (e.channelExists === null) missing.push("채널 존재 여부");
  const urlKind = input.identity.canonicalChannelUrl ? classifyYoutubeUrl(input.identity.canonicalChannelUrl) : "other";
  addHard(!input.identity.canonicalChannelUrl || !["channel", "handle"].includes(urlKind), "channel_url_unconfirmed", "채널 URL");
  const exactChannelIdentity = input.identity.identityVerificationState === "confirmed" && Boolean(input.identity.youtubeChannelId?.trim());
  if (!exactChannelIdentity) addHard(e.channelNameMatches === false, "channel_name_mismatch", "채널명 일치");
  addHard(input.identity.identityVerificationState === "unconfirmed", "identity_unclear", "신원 확인");
  addHard(e.videosExist === false, "no_videos", "영상 존재");
  if (e.videosExist === null && e.recentVideoCount === null) missing.push("영상 존재 여부");
  if (e.latestUploadDate && e.latestUploadConfirmed === true) {
    const ageDays = Math.floor((now.getTime() - new Date(e.latestUploadDate).getTime()) / 86400000);
    addHard(ageDays > settings.maximumDaysSinceLatestUpload, "latest_upload_too_old", "최근 활동");
  } else missing.push("최근 업로드 확인");
  if (e.recentVideoCount !== null) addHard(e.recentVideoCount < settings.minimumRecentVideoCount, "insufficient_recent_video_count", "최근 영상 수"); else missing.push("최근 영상 수");
  const traffic = evaluateRecentTraffic(e, settings);
  addHard(traffic.viralDistortion, "viral_video_distortion", "조회수 왜곡 없음");
  if (traffic.average !== null && traffic.complete) addHard(traffic.belowThreshold, "recent_views_below_threshold", "최근 평균 조회수"); else missing.push("대표 최근 조회수");
  addHard(e.categoryFit === false || !settings.allowedCategories.includes(input.identity.category), "category_mismatch", "카테고리 적합");
  addHard(e.foreignAudienceRisk === true, "foreign_audience_heavy", "국내 시청자 적합");
  addHard(e.overseasBaseRisk === true, "overseas_based", "국내 기반");
  addHard(e.celebrityRisk === true, "celebrity_channel", "비연예인");
  addHard(e.officialChannelRisk === true, "official_channel", "비공식 채널");
  addHard(e.companyChannelRisk === true, "company_channel", "비회사 채널");
  addHard(e.corporateChannelRisk === true, "corporate_channel", "비법인 채널");
  addHard(e.brandChannelRisk === true, "brand_channel", "비브랜드 채널");
  addHard(e.agencyRisk === true, "agency_affiliation", "소속사 없음");
  addHard(e.managementRisk === true, "management_affiliation", "매니지먼트 없음");
  addHard(e.mcnRisk === true, "mcn_affiliation", "MCN 없음");
  addHard(e.labelRisk === true, "label_affiliation", "레이블 없음");
  if (e.recruitmentEvidence.affiliationVerificationState === "conflicting") reasons.push("affiliation_conflict");
  if (e.recruitmentSuitability !== true && e.recruitmentEvidence.koreanLanguageActivity.state !== "likely") {
    missing.push("국내 활동 적합성");
  }
  addHard(e.reuploadRisk === true, "reupload_channel", "재업로드 아님");
  addHard(e.compilationRisk === true || e.contentFarmRisk === true, "compilation_channel", "모음·콘텐츠 팜 채널 아님");
  const emailReason = emailExclusions[e.emailClassification]; if (emailReason) reasons.push(emailReason);
  if (e.emailClassification === "not_found") reasons.push("missing_email");
  if (e.emailClassification === "not_checked") reasons.push("email_not_checked");
  if (e.emailClassification === "unknown") reasons.push("email_ownership_unknown");
  if (settings.maximumSubscriberCount !== undefined && e.subscriberCount !== null && e.subscriberCount > settings.maximumSubscriberCount) reasons.push("too_large");
  if (settings.minimumSubscriberCount === undefined && settings.maximumSubscriberCount === undefined) warnings.push(reasonExplanations.subscriber_threshold_not_configured);
  if (missing.length) reasons.push("missing_verification");

  const hardCodes = reasons.filter((code) => !["missing_email", "email_not_checked", "email_ownership_unknown", "affiliation_conflict", "missing_verification", "subscriber_threshold_not_configured"].includes(code));
  const decision = hardCodes.length ? "excluded" : reasons.some((code) => ["missing_email", "email_not_checked", "email_ownership_unknown", "affiliation_conflict", "missing_verification"].includes(code)) || e.emailClassification !== "personal" ? "hold" : "recommended";
  const uniqueReasons = [...new Set(reasons)];
  const missingVerificationFields = [...new Set(missing)];
  const explanation = decisionReasonTexts(decision, uniqueReasons, missingVerificationFields).join(" ");
  return { decision, reasonCodes: uniqueReasons, koreanExplanation: explanation, passedChecks: passed, failedChecks: failed, warningChecks: warnings, missingVerificationFields, historyMatch, sameRunMatch, manualCorrection: input.manualCorrection ?? null, evaluatedAt: now.toISOString() };
}
