# 아키텍처

## 책임 지도

| 책임 | 소유 경로 |
| --- | --- |
| App Router 페이지 | `src/app/page.tsx`, `src/app/runs/new/page.tsx`, `src/app/runs/[id]/page.tsx`, `src/app/history/page.tsx`, `src/app/settings/page.tsx` |
| 실행 오케스트레이션 | `src/app/runs/[id]/run-detail-client.tsx`, `src/lib/mock-run.ts` |
| 재사용 UI | `src/components/*` |
| 도메인 타입 | `src/types/domain.ts` |
| 판정 설정과 런타임 검증 | `src/config/recommendation-rules.ts` |
| UI 라벨 | `src/config/labels.ts` |
| 결정론적 판정 엔진 | `src/server/rules/evaluate-creator.ts` |
| 최근 조회 평가 | `src/server/rules/recent-traffic.ts` |
| 사유 코드 설명 | `src/server/rules/reason-codes.ts` |
| 히스토리 인터페이스 | `src/server/history/history-repository.ts` |
| 브라우저 저장소 구현 | `src/lib/browser-history-repository.ts` |
| 신원·중복 매칭 | `src/server/history/history-matcher.ts`, `src/server/history/url-classifier.ts` |
| 히스토리 레코드 매핑 | `src/server/history/history-record.ts` |
| 결과 그룹화 | `src/server/output/group-results.ts` |
| 목 입력 데이터 | `src/data/creators.ts`, `src/data/scouting-runs.ts`, `src/data/recommendation-settings.ts` |
| 단위·계약 테스트 | `tests/*.test.ts`, `tests/contracts/*.test.ts` |
| 문서 하네스 | `AGENTS.md`, `README.md`, `docs/*` |

## 의존 방향

```text
UI
  ↓ application orchestration
  ↓ pure decision engine
  ↓ types and configuration

UI
  ↓ history repository interface
  ↓ browser localStorage implementation
```

```text
목 CreatorInput
  → 히스토리/동일 실행 신원 매칭
  → evaluateCreator
  → EvaluationResult
  → groupResults
  → 화면 표시 + HistoryRecord 자동 저장
```

UI가 설정과 입력을 조합하지만 판정 자체는 `evaluateCreator`가 담당합니다. 히스토리 페이지와 실행 상세는 `HistoryRepository` 계약을 통해 저장소를 사용합니다.

## 제한 규칙

- React 컴포넌트는 추천 규칙을 소유하지 않습니다.
- 판정 엔진은 React 없이 독립 테스트 가능해야 합니다.
- 저장소 구현은 히스토리 인터페이스 계약을 따릅니다.
- 향후 외부 데이터 공급자는 어댑터 인터페이스 뒤에 배치합니다.
- 설정 가능한 값을 UI 컴포넌트 안에 숨기지 않습니다.
- 사유 코드는 한국어 표시 메시지와 분리합니다.
- 현재 브라우저 저장소는 임시 구현이며 서버 저장소처럼 취급하지 않습니다.
