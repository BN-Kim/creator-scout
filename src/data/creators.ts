import { normalizeCreatorName } from "@/server/history/history-matcher";
import type { CreatorInput, CreatorIdentity, VerificationEvidence } from "@/types/domain";

const verifiedAt = "2026-07-22T06:00:00.000Z";

function identity(index: number, category = "뷰티"): CreatorIdentity {
  const handle = `@mock-phase2-${String(index).padStart(2, "0")}`;
  const channelName = `목 크리에이터 ${String(index).padStart(2, "0")}`;
  return { internalId: `mock-creator-${String(index).padStart(2, "0")}`, channelName, normalizedChannelName: normalizeCreatorName(channelName), confirmedAliases: [], canonicalChannelUrl: `https://www.youtube.com/${handle}`, youtubeChannelId: `UC_MOCK_PHASE2_${String(index).padStart(2, "0")}`, youtubeHandle: handle, sourceUrls: [`https://www.youtube.com/${handle}`], category, identityVerificationState: "confirmed" };
}

function evidence(): VerificationEvidence {
  return { channelExists: true, channelNameMatches: true, confirmedChannelUrl: "확인됨", videosExist: true, latestUploadDate: "2026-07-15", latestUploadConfirmed: true, recentVideoCount: 5, recentVideoUrls: ["https://www.youtube.com/watch?v=MOCK001"], recentViewCounts: [18000, 17000, 15500, 16200, 17500], recentAverageViews: 16840, subscriberCount: 54000, uploadConsistency: true, contentType: "long_form", categoryFit: true, koreanAudienceSuitable: true, foreignAudienceRisk: false, overseasBaseRisk: false, celebrityRisk: false, officialChannelRisk: false, companyChannelRisk: false, brandChannelRisk: false, corporateChannelRisk: false, agencyRisk: false, managementRisk: false, mcnRisk: false, labelRisk: false, reuploadRisk: false, compilationRisk: false, contentFarmRisk: false, viralVideoDistortionRisk: false, visibleEmail: "creator01@example.invalid", emailVerificationState: "confirmed", emailClassification: "personal", recruitmentSuitability: true, evidenceSource: "2단계 UI 검증용 목 근거", verifiedAt };
}

function mock(index: number, scenario: string, evidencePatch: Partial<VerificationEvidence> = {}, identityPatch: Partial<CreatorIdentity> = {}): CreatorInput {
  const nextIdentity = { ...identity(index), ...identityPatch };
  return { identity: nextIdentity, evidence: { ...evidence(), confirmedChannelUrl: nextIdentity.canonicalChannelUrl, ...evidencePatch }, mockScenario: scenario };
}

export const mockCreatorInputs: CreatorInput[] = [
  mock(1, "모든 조건 통과 및 개인 이메일 확인"),
  mock(2, "이메일 미발견", { visibleEmail: null, emailClassification: "not_found", emailVerificationState: "confirmed" }),
  mock(3, "이메일 미확인", { visibleEmail: null, emailClassification: "not_checked", emailVerificationState: "not_checked" }),
  mock(4, "이메일 소유 유형 불명", { visibleEmail: "unknown@example.invalid", emailClassification: "unknown" }),
  mock(5, "최근 조회수 계산 근거 불완전", { recentViewCounts: [14500, 16800, 15200], recentAverageViews: null }),
  mock(6, "채널 URL 미확인", { confirmedChannelUrl: null }, { canonicalChannelUrl: null, youtubeHandle: null, sourceUrls: ["https://www.youtube.com/results?search_query=mock"] }),
  mock(7, "영상 없음", { videosExist: false, recentVideoCount: 0, recentViewCounts: [], recentAverageViews: null }),
  mock(8, "최근 업로드 오래됨", { latestUploadDate: "2026-04-01" }),
  mock(9, "최근 영상 2개 미만", { recentVideoCount: 1, recentViewCounts: [18000], recentAverageViews: 18000 }),
  mock(10, "최근 평균 조회수 기준 미달", { recentViewCounts: [4200, 5100, 3900, 4800, 4500], recentAverageViews: 4500 }),
  mock(11, "단일 바이럴 영상 왜곡", { recentViewCounts: [120000, 9000, 8000, 7500, 8200], recentAverageViews: 30540, viralVideoDistortionRisk: true }),
  mock(12, "카테고리 불일치", { categoryFit: false }),
  mock(13, "해외 시청자 비중 높음", { koreanAudienceSuitable: false, foreignAudienceRisk: true }),
  mock(14, "해외 기반", { overseasBaseRisk: true }),
  mock(15, "공식 법인 채널", { officialChannelRisk: true, corporateChannelRisk: true }),
  mock(16, "회사 이메일", { visibleEmail: "contact@company.example.invalid", emailClassification: "company" }),
  mock(17, "에이전시 이메일", { visibleEmail: "contact@agency.example.invalid", emailClassification: "agency" }),
  mock(18, "매니지먼트 이메일", { visibleEmail: "contact@management.example.invalid", emailClassification: "management" }),
  mock(19, "MCN 이메일", { visibleEmail: "contact@mcn.example.invalid", emailClassification: "mcn" }),
  mock(20, "레이블 이메일", { visibleEmail: "contact@label.example.invalid", emailClassification: "label" }),
  mock(21, "기존 히스토리 중복"),
  mock(22, "동일 실행의 대체 핸들 중복", {}, { channelName: "목 크리에이터 01 별칭", normalizedChannelName: normalizeCreatorName("목 크리에이터 01 별칭"), youtubeChannelId: "UC_MOCK_PHASE2_01", youtubeHandle: "@mock-phase2-alias", canonicalChannelUrl: "https://www.youtube.com/@mock-phase2-alias", confirmedAliases: ["목 크리에이터 01"] }),
  { ...mock(23, "사용자가 부적합으로 교정"), manualCorrection: { code: "other_invalid", note: "목 시나리오의 사용자 교정", correctedAt: verifiedAt } },
  mock(24, "구독자 기준 미설정, 나머지 조건 통과", { subscriberCount: 980000 }),
];

export const initialMockHistoryCreator = mockCreatorInputs[20];
