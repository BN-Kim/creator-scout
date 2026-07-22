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
| 서버 저장소 구현 | `src/server/history/sqlite-history-repository.ts`, `src/server/history/server-history-repository.ts` |
| 데이터베이스와 마이그레이션 | `src/server/database/database.ts`, `src/server/database/migrations.ts` |
| 히스토리 HTTP 경계 | `src/app/api/history/*`, `src/lib/history-api-client.ts` |
| 브라우저 저장소 전환 호환 | `src/lib/browser-history-repository.ts`, `src/lib/history-api-client.ts` |
| 신원·중복 매칭 | `src/server/history/history-matcher.ts`, `src/server/history/url-classifier.ts` |
| 히스토리 레코드 매핑 | `src/server/history/history-record.ts` |
| 결과 그룹화 | `src/server/output/group-results.ts` |
| 향후 공급자·자동 파이프라인 | H3의 공급자 인터페이스, H4의 실행 오케스트레이션에 추가 예정 |
| 목 입력 데이터 | `src/data/creators.ts`, `src/data/scouting-runs.ts`, `src/data/recommendation-settings.ts` |
| 단위·계약 테스트 | `tests/*.test.ts`, `tests/contracts/*.test.ts` |
| 브라우저 UI 스모크 테스트 | `playwright.config.ts`, `tests/e2e/smoke.spec.ts` |
| 문서 하네스 | `AGENTS.md`, `README.md`, `docs/*` |

## 의존 방향

```text
UI
  ↓ application orchestration
  ↓ pure decision engine
  ↓ types and configuration

UI
  ↓ history repository interface
  ↓ history HTTP API
  ↓ SQLite HistoryRepository implementation
  ↓ versioned database schema
```

```text
목 CreatorInput
  → 히스토리/동일 실행 신원 매칭
  → evaluateCreator
  → EvaluationResult
  → groupResults
  → 화면 표시 + HistoryRecord 자동 저장
```

현재 목 실행은 기존 엔진의 방어적 중복 판정을 노출하는 테스트 하네스입니다. 실제 자동 파이프라인의 목표 의존 순서는 다음과 같습니다.

```text
후보 발견
  → 안정적 채널 신원 정규화
  → 동일 실행 블록리스트
  → SQLite 히스토리 사전 확인
     ├─ 과거 일치: 조용히 건너뛰기 + 실행 통계
     └─ 신규: 근거 수집 → 결정론적 판정 → SQLite 자동 저장 → 현재 실행 결과
```

과거 일치는 판정 엔진이나 결과 그룹으로 보내지 않습니다. 따라서 비용이 큰 근거 수집, 새 `excluded` 결과와 추가 히스토리 쓰기가 발생하지 않습니다.

UI가 설정과 입력을 조합하지만 판정 자체는 `evaluateCreator`가 담당합니다. 히스토리 페이지와 실행 상세는 `HistoryRepository` 계약을 통해 저장소를 사용합니다.

## 제한 규칙

- React 컴포넌트는 추천 규칙을 소유하지 않습니다.
- 판정 엔진은 React 없이 독립 테스트 가능해야 합니다.
- 저장소 구현은 히스토리 인터페이스 계약을 따릅니다.
- 향후 외부 데이터 공급자는 어댑터 인터페이스 뒤에 배치합니다.
- 설정 가능한 값을 UI 컴포넌트 안에 숨기지 않습니다.
- 사유 코드는 한국어 표시 메시지와 분리합니다.
- `localStorage`는 현재 v2 기록을 한 번 서버로 전환하는 입력으로만 사용하며 원본으로 취급하지 않습니다.
- JSON 내보내기는 읽기 전용 호환 출력이며 파이프라인 입력이 아닙니다.
