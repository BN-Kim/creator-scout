import { mockCreatorInputs } from "@/data/creators";
import { createInitialHistory } from "@/lib/mock-run";
import type { CreatorDecision, CreatorIdentity, CreatorInput, HistoryRecord, ReasonCode } from "@/types/domain";

export interface GoldenDecisionFixture {
  name: string;
  input: CreatorInput;
  history: HistoryRecord[];
  sameRun: CreatorIdentity[];
  expectedDecision: CreatorDecision;
  expectedPrimaryReasonCode: ReasonCode | null;
}

const fixture = (name: string, sourceIndex: number, expectedDecision: CreatorDecision, expectedPrimaryReasonCode: ReasonCode | null, history: HistoryRecord[] = [], sameRun: CreatorIdentity[] = []): GoldenDecisionFixture => ({
  name,
  input: mockCreatorInputs[sourceIndex - 1],
  history,
  sameRun,
  expectedDecision,
  expectedPrimaryReasonCode,
});

export const goldenDecisionFixtures: GoldenDecisionFixture[] = [
  fixture("완전 검증된 개인 이메일 추천", 1, "recommended", null),
  fixture("이메일 미발견 보류", 2, "hold", "missing_email"),
  fixture("이메일 소유 불명 보류", 4, "hold", "email_ownership_unknown"),
  fixture("회사 이메일 제외", 16, "excluded", "company_email"),
  fixture("에이전시 이메일 제외", 17, "excluded", "agency_email"),
  fixture("매니지먼트 이메일 제외", 18, "excluded", "management_email"),
  fixture("MCN 이메일 제외", 19, "excluded", "mcn_email"),
  fixture("중앙 조회수 기준을 통과한 효율형 채널 추천", 10, "recommended", null),
  fixture("비활성 신호를 점수에만 반영한 추천", 8, "recommended", "latest_upload_too_old"),
  fixture("파이프라인 사전 확인을 우회한 과거 중복 방어", 21, "excluded", "prior_history_duplicate", createInitialHistory()),
  fixture("동일 실행 신원 블록리스트를 우회한 중복 방어", 22, "excluded", "same_run_duplicate", [], [mockCreatorInputs[0].identity]),
  fixture("수동 교정 제외", 23, "excluded", "user_corrected_invalid"),
];
