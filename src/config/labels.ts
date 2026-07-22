import type { CreatorDecision, EmailClassification, HistoryStatus, RunStatus } from "@/types/domain";

export const decisionLabels: Record<CreatorDecision, string> = { recommended: "추천", hold: "보류", excluded: "제외" };
export const historyStatusLabels: Record<HistoryStatus, string> = { recommended: "추천", candidate: "보류", excluded: "제외" };
export const runStatusLabels: Record<RunStatus, string> = { running: "처리 중", reviewing: "검토 중", completed: "완료" };
export const emailClassificationLabels: Record<EmailClassification, string> = { personal: "개인 이메일 확인", company: "회사 이메일", agency: "에이전시 이메일", management: "매니지먼트 이메일", mcn: "MCN 이메일", label: "레이블 이메일", unknown: "소유 유형 불명", not_found: "미발견", not_checked: "확인 전" };
export const creatorCategories = ["뷰티", "푸드", "테크", "라이프스타일", "여행"] as const;
