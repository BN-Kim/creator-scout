# 판정 규칙 구현 지도

정식 업무 규칙은 [`product-rules.md`](product-rules.md)에만 유지합니다. 이 문서는 구현 탐색용 지도입니다.

- 판정 순서와 하드 게이트: `src/server/rules/evaluate-creator.ts`
- 설정 가능한 임계값과 하드 제외 분류: `src/config/recommendation-rules.ts`
- 최근 조회 표본과 바이럴 왜곡 계산: `src/server/rules/recent-traffic.ts`
- 사유 코드별 한국어 설명: `src/server/rules/reason-codes.ts`
- 도메인 입력·출력 타입: `src/types/domain.ts`
- 영구 회귀 계약: `tests/contracts/product-invariants.test.ts`
- 안정적인 예시: `tests/fixtures/golden-decisions.ts`

임계값 또는 판정 의미를 변경하려면 제품 결정 기록과 계약 테스트를 함께 갱신해야 합니다.
