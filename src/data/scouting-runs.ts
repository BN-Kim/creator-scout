import type { ScoutingRun } from "@/types/domain";

export const mockScoutingRuns: ScoutingRun[] = [
  { id: "run-20260722-beauty", name: "2단계 목 규칙 검증", category: "뷰티", createdAt: "2026-07-22", totalDiscovered: 24, candidateCount: 4, approvedCount: 2, excludedCount: 18, status: "reviewing" },
  { id: "run-20260721-tech", name: "테크 마이크로 채널 탐색", category: "테크", createdAt: "2026-07-21", totalDiscovered: 35, candidateCount: 9, approvedCount: 7, excludedCount: 19, status: "completed" },
  { id: "run-20260720-food", name: "여름 푸드 캠페인 후보", category: "푸드", createdAt: "2026-07-20", totalDiscovered: 62, candidateCount: 21, approvedCount: 8, excludedCount: 27, status: "running" },
  { id: "run-20260718-life", name: "라이프스타일 정기 스캔", category: "라이프스타일", createdAt: "2026-07-18", totalDiscovered: 41, candidateCount: 11, approvedCount: 6, excludedCount: 24, status: "completed" },
];
