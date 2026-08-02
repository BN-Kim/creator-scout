import { isPermanentHardExclusionReason, recommendationRuleVersion } from "@/config/recommendation-rules";
import { findHistoryMatch, findSameRunMatch } from "@/server/history/history-matcher";
import { classifyYoutubeUrl } from "@/server/history/url-classifier";
import { decisionReasonTexts } from "@/server/rules/reason-codes";
import { scoreCreatorFit } from "@/server/rules/score-creator-fit";
import type {
  CreatorInput,
  EvaluationResult,
  HistoryRecord,
  ReasonCode,
  RecommendationSettings,
} from "@/types/domain";

const emailExclusions: Partial<Record<string, ReasonCode>> = {
  company: "company_email",
  agency: "agency_email",
  management: "management_email",
  mcn: "mcn_email",
  label: "label_email",
};

export function evaluateCreator(
  input: CreatorInput,
  settings: RecommendationSettings,
  history: HistoryRecord[],
  sameRun: CreatorInput["identity"][],
  now = new Date(),
): EvaluationResult {
  const passed: string[] = [];
  const failed: string[] = [];
  const warnings: string[] = [];
  const missing: string[] = [];
  const reasons: ReasonCode[] = [];
  const historyMatch = findHistoryMatch(input.identity, history);
  if (historyMatch) reasons.push("prior_history_duplicate");
  const sameRunMatch = findSameRunMatch(input.identity, sameRun);
  if (sameRunMatch) reasons.push("same_run_duplicate");
  if (input.manualCorrection) reasons.push("user_corrected_invalid");

  const evidence = input.evidence;
  const addHard = (condition: boolean, code: ReasonCode, label: string): void => {
    if (condition) {
      reasons.push(code);
      failed.push(label);
    } else {
      passed.push(label);
    }
  };
  const addSoft = (condition: boolean, code: ReasonCode, label: string): void => {
    if (condition) {
      reasons.push(code);
      warnings.push(label);
    } else {
      passed.push(label);
    }
  };

  addHard(evidence.channelExists === false, "channel_not_found", "채널 존재");
  if (evidence.channelExists === null) missing.push("채널 존재 여부");
  const urlKind = input.identity.canonicalChannelUrl ? classifyYoutubeUrl(input.identity.canonicalChannelUrl) : "other";
  addHard(!input.identity.canonicalChannelUrl || !["channel", "handle"].includes(urlKind), "channel_url_unconfirmed", "채널 URL");
  const exactChannelIdentity = input.identity.identityVerificationState === "confirmed"
    && Boolean(input.identity.youtubeChannelId?.trim());
  if (!exactChannelIdentity) addHard(evidence.channelNameMatches === false, "channel_name_mismatch", "채널명 일치");
  addHard(input.identity.identityVerificationState === "unconfirmed", "identity_unclear", "신원 확인");
  addHard(evidence.videosExist === false, "no_videos", "영상 존재");
  if (evidence.videosExist === null && evidence.recentVideoCount === null) missing.push("영상 존재 여부");

  if (evidence.latestUploadDate && evidence.latestUploadConfirmed === true) {
    const ageDays = Math.floor((now.getTime() - new Date(evidence.latestUploadDate).getTime()) / 86_400_000);
    addSoft(ageDays > settings.maximumDaysSinceLatestUpload, "latest_upload_too_old", "최근 활동 기준 미달");
  } else {
    missing.push("최근 업로드 확인");
  }
  if (evidence.recentVideoCount !== null) {
    addSoft(
      evidence.recentVideoCount < settings.minimumRecentVideoCount,
      "insufficient_recent_video_count",
      "최근 영상 수 기준 미달",
    );
  } else {
    missing.push("최근 영상 수");
  }

  const score = scoreCreatorFit(input, settings, now);
  addSoft(score.traffic.viralDistortion, "viral_video_distortion", "조회수 변동성 주의");
  if (score.traffic.complete) {
    addSoft(score.traffic.belowThreshold, "recent_views_below_threshold", "도달력 기준 미달");
  } else {
    missing.push("대표 최근 조회수");
  }

  addHard(
    evidence.categoryFit === false
      || (evidence.categoryFit === true && !settings.allowedCategories.includes(input.identity.category)),
    "category_mismatch",
    "카테고리 적합",
  );
  if (evidence.categoryFit === null) missing.push("카테고리 적합성");
  addHard(evidence.foreignAudienceRisk === true, "foreign_audience_heavy", "국내 시청자 적합");
  addHard(evidence.overseasBaseRisk === true, "overseas_based", "국내 기반");
  addHard(evidence.celebrityRisk === true, "celebrity_channel", "비연예인");
  addHard(evidence.officialChannelRisk === true, "official_channel", "비공식 채널");
  addHard(evidence.companyChannelRisk === true, "company_channel", "비회사 채널");
  addHard(evidence.corporateChannelRisk === true, "corporate_channel", "비법인 채널");
  addHard(evidence.brandChannelRisk === true, "brand_channel", "비브랜드 채널");
  addHard(evidence.agencyRisk === true, "agency_affiliation", "소속사 없음");
  addHard(evidence.managementRisk === true, "management_affiliation", "매니지먼트 없음");
  addHard(evidence.mcnRisk === true, "mcn_affiliation", "MCN 없음");
  addHard(evidence.labelRisk === true, "label_affiliation", "레이블 없음");
  if (evidence.recruitmentEvidence.affiliationVerificationState === "conflicting") {
    reasons.push("affiliation_conflict");
  }
  if (evidence.recruitmentSuitability !== true
    && evidence.recruitmentEvidence.koreanLanguageActivity.state !== "likely") {
    missing.push("국내 활동 적합성");
  }
  addHard(evidence.reuploadRisk === true, "reupload_channel", "재업로드 아님");
  addHard(
    evidence.compilationRisk === true || evidence.contentFarmRisk === true,
    "compilation_channel",
    "모음·콘텐츠 팜 채널 아님",
  );

  const emailReason = emailExclusions[evidence.emailClassification];
  if (emailReason) reasons.push(emailReason);
  if (evidence.emailClassification === "not_found") reasons.push("missing_email");
  if (evidence.emailClassification === "not_checked"
    || (evidence.emailClassification === "personal" && evidence.emailVerificationState !== "confirmed")) {
    reasons.push("email_not_checked");
  }
  if (evidence.emailClassification === "unknown") reasons.push("email_ownership_unknown");

  if (evidence.subscriberCount === null) {
    missing.push("구독자 수");
  } else if (evidence.subscriberCount < settings.minimumSubscriberCount) {
    reasons.push("subscriber_below_target");
    warnings.push("구독자 목표 범위 미달");
  } else if (evidence.subscriberCount > settings.maximumSubscriberCount) {
    reasons.push("too_large");
    warnings.push("구독자 목표 범위 초과");
  } else {
    passed.push("구독자 목표 범위");
  }
  if (missing.length > 0) reasons.push("missing_verification");

  const uniqueReasons = [...new Set(reasons)];
  const permanentHardReasons = uniqueReasons.filter(isPermanentHardExclusionReason);
  const missingVerificationFields = [...new Set(missing)];
  const recommendationReady = missingVerificationFields.length === 0
    && !uniqueReasons.includes("affiliation_conflict");
  const hasSufficientEvidenceForLowFitExclusion = missingVerificationFields.length === 0
    && !uniqueReasons.includes("email_not_checked")
    && !uniqueReasons.includes("email_ownership_unknown");

  let decision: EvaluationResult["decision"];
  if (permanentHardReasons.length > 0) {
    decision = "excluded";
  } else if (score.fitScore < settings.holdScoreThreshold && hasSufficientEvidenceForLowFitExclusion) {
    decision = "excluded";
    uniqueReasons.push("fit_score_below_threshold");
  } else if (
    score.fitScore >= settings.recommendationScoreThreshold
    && score.contactReady
    && recommendationReady
  ) {
    decision = "recommended";
  } else {
    decision = "hold";
  }

  const recheckAt = decision === "recommended" || permanentHardReasons.length > 0
    ? null
    : addDays(
        now,
        decision === "excluded" ? settings.dynamicExclusionTtlDays : settings.holdRecheckDays,
      ).toISOString();
  const explanation = decisionReasonTexts(
    decision,
    uniqueReasons,
    missingVerificationFields,
    score.fitScore,
    settings.recommendationScoreThreshold,
  ).join(" ");

  return {
    decision,
    fitScore: score.fitScore,
    scoreComponents: score.scoreComponents,
    contactReady: score.contactReady,
    ruleVersion: recommendationRuleVersion,
    recheckAt,
    appliedSettings: cloneSettings(settings),
    decisionSource: input.manualCorrection ? "manual" : "system",
    reasonCodes: uniqueReasons,
    koreanExplanation: explanation,
    passedChecks: [...new Set(passed)],
    failedChecks: [...new Set(failed)],
    warningChecks: [...new Set(warnings)],
    missingVerificationFields,
    historyMatch,
    sameRunMatch,
    manualCorrection: input.manualCorrection ?? null,
    evaluatedAt: now.toISOString(),
  };
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

function cloneSettings(settings: RecommendationSettings): RecommendationSettings {
  return {
    ...settings,
    allowedCategories: [...settings.allowedCategories],
    blockedChannelTypes: [...settings.blockedChannelTypes],
    excludedEmailClassifications: [...settings.excludedEmailClassifications],
    scoreWeights: { ...settings.scoreWeights },
  };
}
