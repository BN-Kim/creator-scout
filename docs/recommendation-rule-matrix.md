# 판정 규칙 구현 지도

정식 업무 규칙은 [`product-rules.md`](product-rules.md)에만 유지합니다. 이 문서는 구현 탐색용 지도입니다.

- 100점 적합도 구성요소와 가중치 계산: `src/server/rules/score-creator-fit.ts`
- 판정 순서, 하드 게이트, 점수 구간 적용: `src/server/rules/evaluate-creator.ts`
- 설정 가능한 임계값·가중치·하드 제외 분류: `src/config/recommendation-rules.ts`
- 최근 조회 평균·절사 평균·중앙값과 바이럴 편중 계산: `src/server/rules/recent-traffic.ts`
- 동적 판정 TTL·규칙 버전 재검증 정책: `src/server/history/history-recheck.ts`
- 저장된 근거를 이용한 실행 재평가: `src/server/scouting/reevaluate-automatic-run.ts`
- 수동 판정·감사 기록: `src/server/scouting/manual-decision-service.ts`, `src/server/history/sqlite-decision-audit-repository.ts`
- 사유 코드별 한국어 설명: `src/server/rules/reason-codes.ts`
- 도메인 입력·출력 타입: `src/types/domain.ts`
- 영구 회귀 계약: `tests/contracts/product-invariants.test.ts`
- 안정적인 예시: `tests/fixtures/golden-decisions.ts`

임계값, 가중치 또는 판정 의미를 변경하려면 `ruleVersion`, 제품 결정 기록, 계약 테스트를 함께 갱신해야 합니다. 조직 이메일과 회사·브랜드·공식·재업로드·무효 채널은 점수로 뒤집을 수 없는 영구 하드 제외입니다.
