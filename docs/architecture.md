# 아키텍처

## 책임 지도

| 책임 | 소유 경로 |
| --- | --- |
| App Router 페이지 | `src/app/page.tsx`, `src/app/runs/new/page.tsx`, `src/app/runs/[id]/page.tsx`, `src/app/history/page.tsx`, `src/app/settings/page.tsx`, `src/app/operations/page.tsx` |
| 실행 오케스트레이션 | `src/server/scouting/automatic-scouting-pipeline.ts`, `src/server/scouting/automatic-scouting-service.ts`, `src/app/api/runs/automatic/route.ts` |
| H6 예약·잠금·복구 | `src/server/operations/operation-coordinator.ts`, `src/server/operations/operational-scheduler.ts`, `src/server/operations/sqlite-operation-repository.ts` |
| H6 런타임·운영 API | `src/instrumentation.ts`, `src/server/operations/operation-runtime.ts`, `src/app/api/operations/route.ts` |
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
| YouTube 공급자 계약·선택 | `src/server/providers/youtube/provider-contracts.ts`, `src/server/providers/youtube/create-provider.ts` |
| YouTube 공급자 어댑터 | `src/server/providers/youtube/innertube-provider.ts`, `src/server/providers/youtube/youtube-data-api-provider.ts` |
| 서버 전용 YouTube.js 브리지 | `src/server/providers/youtube/youtubejs-runtime.ts`, `src/server/providers/youtube/innertube-client.ts` |
| YouTube.js 영상 카드 정규화 | `src/server/providers/youtube/youtubejs-video-normalization.ts` |
| 공급자 오류·설정·로깅 | `src/server/providers/youtube/provider-error.ts`, `src/server/providers/youtube/provider-config.ts`, `src/server/providers/youtube/provider-logger.ts` |
| 안정적 신원 정규화 | `src/server/providers/youtube/identity-input.ts` |
| 히스토리 사전 확인·근거 변환 | `src/server/providers/youtube/history-prechecked-evidence.ts`, `src/server/providers/youtube/verification-evidence.ts` |
| 실행 결과 조합·표시 | `src/server/scouting/creator-input-assembler.ts`, `src/app/runs/[id]/automatic-run-result.tsx` |
| 리크루팅 근거 계약·정규화 | `src/server/providers/recruitment/provider-contract.ts`, `src/server/providers/recruitment/approved-public-provider.ts`, `src/server/providers/recruitment/verification-evidence.ts` |
| H5.1 공개 출처 수집·분류 | `src/server/providers/recruitment/live-recruitment-provider.ts`, `src/server/providers/recruitment/public-web-client.ts`, `src/server/providers/recruitment/visible-email-classifier.ts`, `src/server/providers/recruitment/korean-language-activity.ts` |
| 목 입력 데이터 | `src/data/creators.ts`, `src/data/scouting-runs.ts`, `src/data/recommendation-settings.ts` |
| 단위·계약 테스트 | `tests/*.test.ts`, `tests/contracts/*.test.ts` |
| 브라우저 UI 스모크 테스트 | `playwright.config.ts`, `tests/e2e/smoke.spec.ts` |
| 브라우저 테스트 서버 수명주기 | `scripts/run-playwright.mjs` |
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

기존 목 실행은 엔진의 방어적 중복 판정을 노출하는 회귀 하네스입니다. H4 자동 파이프라인은 다음 의존 순서를 구현합니다.

```text
후보 발견
  → 안정적 채널 신원 정규화
  → 동일 실행 블록리스트
  → SQLite 히스토리 사전 확인
     ├─ 과거 일치: 조용히 건너뛰기 + 실행 통계
     └─ 신규: 근거 수집 → 결정론적 판정 → SQLite 자동 저장 → 현재 실행 결과
```

과거 일치는 판정 엔진이나 결과 그룹으로 보내지 않습니다. 따라서 비용이 큰 근거 수집, 새 `excluded` 결과와 추가 히스토리 쓰기가 발생하지 않습니다.

YouTube.js 영상 목록은 런타임 객체와 판정 근거 사이의 별도 정규화 경계에서 처리합니다. LockupView의 `content_id`는 `content_type`이 VIDEO 또는 SHORT일 때만 영상 ID가 되며, CHANNEL·PLAYLIST는 영상이 아닙니다. 목록 상태는 `available`, `confirmed_empty`, `unavailable`, `unsupported`, `malformed`로 분리합니다. 마지막 세 상태는 어댑터에서 구조화된 공급자 실패가 되어 평가와 히스토리 저장에 도달하지 않습니다.

H4.2 오케스트레이션은 발견 후보 수가 아니라 신규 `recommended` 수를 실행 목표로 사용합니다. 남은 추천 슬롯 이하의 후보만 발견·평가하고, `hold`와 `excluded`는 저장한 뒤 다음 후보를 계속 찾습니다. 중복과 실패는 목표에 포함하지 않으며 후보·페이지·시간·공급자 실패 상한 중 하나에 도달하거나 소스가 소진되면 구조화된 중단 사유와 부분 충족 통계를 반환합니다.

H4.3은 H4.2 앞단에 `AdaptiveQuerySelector`를 둡니다. 서버에서 검증한 분류체계가 좁은·중간·넓은 한국어 검색어를 결정론적으로 만들고, `automatic`, `manual_replace`, `manual_extend` 모드가 선택 가능한 검색어 집합을 정합니다. 쿼리 본문, 정규화 키, 카테고리, 범위, 연속 페이지 토큰, 시도·페이지·중복·판정·실패 집계, 냉각·소진 상태는 SQLite `discovery_query_state`에 저장됩니다. 추천된 크리에이터의 공개 메타데이터에서 안전하게 정규화한 문구만 `discovery_learned_terms`에 탐색 상태로 저장됩니다. 최소 표본 전에는 검증된 상위 검색어가 될 수 없으며 성과가 나쁜 학습 문구는 냉각 또는 폐기됩니다. 이 점수와 상태는 발견 순서만 바꾸고 결정 엔진 입력이나 판정 임계값은 바꾸지 않습니다.

H5 리크루팅 근거는 히스토리 선검사와 YouTube 근거 수집을 통과한 신규 신원에만 적용됩니다. 승인 출처 클라이언트의 원본 응답은 어댑터 경계에 남고, 출처 ID·공개 URL·확인 상태·확인 시각을 가진 정규화 연락·소속·국내 적합성 관측값만 `CreatorInput` 조합 경계에 전달됩니다. 미확인·누락·상충 값은 확정 값으로 승격하지 않으며, 확인된 조직 연락처와 소속은 기존 판정 필드에 매핑되어 기존 하드 게이트를 그대로 사용합니다.

H5.1 수집기는 서버 전용 YouTube.js 브리지에서 채널 설명, 최근 공개 영상 최대 20개의 제목·설명과 채널이 직접 공개한 외부 링크를 안정적인 스냅샷으로 받습니다. 공식 사이트 수집기는 그 정확한 호스트의 공개 HTML과 실제 링크된 허용 페이지만 `robots.txt` 및 유한 요청 제한 아래 확인합니다. HTML과 YouTube.js 원본 객체는 경계 밖으로 전달하거나 저장하지 않습니다. 이메일 분류는 도메인·주변 문맥·검증된 공식 사이트 근거만 사용하며, 한국어 활동 신호는 시청자 지역과 별도 근거로 유지합니다.

H6는 기존 H4 실행을 `OperationCoordinator` 뒤에서 호출하되 판정 입력과 규칙은 변경하지 않습니다. 예약과 운영 중지 상태, 파일 공유 프로세스 잠금, 실행·이벤트 기록은 SQLite v3 테이블에 저장됩니다. 예약기는 `instrumentation.ts`에서 장기 실행 Node.js 프로세스당 한 번 시작되고, 만료된 잠금의 실행은 `interrupted`로 기록한 뒤 기존 히스토리 선검사와 멱등 파이프라인을 통해 복구합니다. 모든 실행과 이벤트는 상관관계 ID를 공유하며 로그 메타데이터는 허용 필드만 보존합니다.

```text
수동 요청 또는 예약 확인
  → 운영 중지 확인 → 실행 시작 간격 제한
  → SQLite 조건부 잠금 획득
  → 상관관계 실행 기록
  → 기존 H4/H4.3/H5.1 파이프라인
  → 성공·오류·중복 통계 기록
  → 잠금 해제와 다음 예약 계산
```

현재 잠금은 같은 SQLite 파일을 공유하는 프로세스만 조정합니다. 여러 서버나 서버리스 환경의 분산 예약은 H7 배포 의사결정 전까지 지원하지 않습니다.

H3 단일 후보 경계는 독립적으로 유지되며 H4 파이프라인이 같은 공급자 계약과 근거 변환을 배치 단위로 소비합니다.

```text
YouTube identity input
  → identity provider → stable channel ID + raw identity response
  → exact channel-ID SQLite history precheck
     ├─ prior match: skipped_history
     └─ new identity
          → channel evidence provider → normalized + raw
          → recent video provider → normalized + raw
          → VerificationEvidence (decision not invoked)
```

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
- 공급자 원본 응답은 정규화 근거와 분리하고 UI·판정 엔진에 직접 전달하지 않습니다.
- YouTube.js의 변동 가능한 파서 객체는 서버 전용 런타임 브리지 밖으로 전달하지 않고 안정적인 내부 스냅샷으로 격리합니다.
- 리크루팅 근거 공급자는 생성 시 명시적으로 허용된 출처 ID만 수락하고 승인되지 않은 출처를 거부합니다.
- H5.1 라이브 수집 범위는 채택된 결정 008의 정확한 출처와 방식으로 제한합니다. 출처 유형 추가나 허구 픽스처는 범위 확대 승인이 아닙니다.
