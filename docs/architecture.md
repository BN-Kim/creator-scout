# 아키텍처

## 책임 지도

| 책임 | 소유 경로 |
| --- | --- |
| App Router 페이지 | `src/app/runs/new/page.tsx`, `src/app/runs/[id]/page.tsx`, `src/app/history/page.tsx`, `src/app/settings/page.tsx`, `src/app/insights/page.tsx` |
| 이전 주소 리디렉션 | `src/app/page.tsx`, `src/app/operations/page.tsx` |
| 실행 오케스트레이션 | `src/server/scouting/automatic-scouting-pipeline.ts`, `src/server/scouting/automatic-scouting-service.ts`, `src/app/api/runs/automatic/route.ts` |
| H6 예약·잠금·복구 | `src/server/operations/operation-coordinator.ts`, `src/server/operations/operational-scheduler.ts`, `src/server/operations/sqlite-operation-repository.ts` |
| H6 런타임·운영 API | `src/instrumentation.ts`, `src/server/operations/operation-runtime.ts`, `src/app/api/operations/route.ts` |
| 재사용 UI | `src/components/*` |
| 도메인 타입 | `src/types/domain.ts` |
| 판정 설정과 런타임 검증 | `src/config/recommendation-rules.ts`, `src/lib/validation.ts` |
| UI 라벨 | `src/config/labels.ts` |
| 결정론적 판정 엔진 | `src/server/rules/evaluate-creator.ts`, `src/server/rules/score-creator-fit.ts` |
| 최근 조회 평가 | `src/server/rules/recent-traffic.ts` |
| 재검증 정책과 실행 재평가 | `src/server/history/history-recheck.ts`, `src/server/scouting/reevaluate-automatic-run.ts` |
| 수동 판정과 감사 이력 | `src/server/scouting/manual-decision-service.ts`, `src/server/history/sqlite-decision-audit-repository.ts` |
| 마케팅 후속 성과와 진단 | `src/server/marketing/*`, `src/app/insights/page.tsx` |
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
| YouTube 공식 공급자 어댑터 | `src/server/providers/youtube/youtube-data-api-provider.ts` |
| 공급자 오류·설정·로깅 | `src/server/providers/youtube/provider-error.ts`, `src/server/providers/youtube/provider-config.ts`, `src/server/providers/youtube/provider-logger.ts` |
| 안정적 신원 정규화 | `src/server/providers/youtube/identity-input.ts` |
| 히스토리 사전 확인·근거 변환 | `src/server/providers/youtube/history-prechecked-evidence.ts`, `src/server/providers/youtube/verification-evidence.ts` |
| 실행 결과 조합·표시 | `src/server/scouting/creator-input-assembler.ts`, `src/app/runs/[id]/automatic-run-result.tsx` |
| 리크루팅 근거 계약·정규화 | `src/server/providers/recruitment/provider-contract.ts`, `src/server/providers/recruitment/approved-public-provider.ts`, `src/server/providers/recruitment/verification-evidence.ts` |
| H5.1 공개 출처 수집·분류 | `src/server/providers/recruitment/youtube-data-api-recruitment-client.ts`, `src/server/providers/recruitment/live-recruitment-provider.ts`, `src/server/providers/recruitment/public-web-client.ts`, `src/server/providers/recruitment/visible-email-classifier.ts`, `src/server/providers/recruitment/korean-language-activity.ts` |
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

공식 YouTube Data API v3 응답은 공급자 어댑터에서 정규화합니다. 채널 검색과 `publishedAfter`가 적용된 최근 영상 검색을 번갈아 사용하고, 영상 결과의 `channelId`를 추출해 채널 단위로 중복 제거합니다. 최신 업로드 최대 50개를 조회해 설정된 활동 기간의 영상 수, 평균·절사 평균·중앙값, 조회수/구독자 효율을 계산합니다. 삭제·비공개 영상이나 게시 시각 누락처럼 구간 계산을 완결할 수 없는 응답은 숫자 0으로 바꾸지 않고 미확인 근거로 전달합니다.

공개 이메일 수집은 먼저 `channels.snippet.description`을 독립적으로 확보한 뒤 `playlistItems`의 `snippet.description`에서 최근 영상 설명을 보강합니다. 영상 설명 단계가 실패해도 이미 확보한 채널 설명과 이메일은 폐기하지 않습니다. 공개 설명 텍스트는 별도 추출 경계에서 NFKC·전각 기호·제로폭 문자·명시적 `(at)/(dot)` 표기만 정규화하며, 완전한 로컬 파트와 도메인이 보이지 않으면 이메일을 추측하지 않습니다. 같은 개인 이메일이 여러 승인 출처에 반복되거나 여러 개인 이메일이 명시되어도 주소 값 차이만으로 소유 유형 충돌을 만들지 않습니다.

H4.2 오케스트레이션은 발견 후보 수가 아니라 신규 `recommended` 수를 실행 목표로 사용합니다. 한 검색어가 결과를 독점하지 않도록 검색어당 최대 10개 후보를 평가한 뒤 다른 검색어로 순환하고, 연속 페이지 토큰은 다른 검색어가 최소 한 차례 기회를 얻은 뒤 다시 선택합니다. 후보를 순차 평가하고 남은 추천 슬롯이 0이 되는 즉시 추가 평가를 중단합니다. `hold`와 `excluded`는 저장한 뒤 다음 후보를 계속 찾고, 부분 처리 통계도 `recordProgress`로 즉시 검색어 품질에 반영합니다. 중복과 실패는 목표에 포함하지 않으며 후보·페이지·시간·공급자 실패 상한 중 하나에 도달하거나 소스가 소진되면 구조화된 중단 사유와 부분 충족 통계를 반환합니다. 목표 19명까지는 기본 60초 동기 실행으로 처리하고, 20명 이상은 API가 202를 반환하는 백그라운드 실행으로 전환해 기본 15분 한도에서 상태를 폴링합니다.

`/runs` 실행 히스토리는 SQLite 운영 실행과 히스토리 API를 최초 진입, 추천 실행 완료 알림, 탭 복귀 시점에 읽습니다. 고정 주기 polling은 사용하지 않습니다. 자동 실행의 상세 결과 묶음도 SQLite에 저장하므로 서버 재시작 이후 같은 실행 ID로 다시 열 수 있습니다. 서버의 판정·실행 시각은 UTC ISO 문자열로 저장하고 사용자 화면에서는 `Asia/Seoul` 시간대로 고정해 표시합니다. 대시보드와 운영 제어 UI는 사용자 흐름에서 제거했으며 `/`와 이전 `/operations` 주소는 `/runs/new`로 리디렉션합니다. H6 운영 런타임과 API는 실행 안전성을 위해 서버 내부에 유지합니다.

H4.3은 H4.2 앞단에 `AdaptiveQuerySelector`를 둡니다. 서버에서 검증한 분류체계가 좁은·중간·넓은 한국어 검색어를 결정론적으로 만들고, `automatic`, `manual_replace`, `manual_extend` 모드가 선택 가능한 검색어 집합을 정합니다. 선택기는 실행 중 선택 횟수가 적은 카테고리를 먼저 배치한 뒤 기존 표본·성과 점수를 적용합니다. 20명을 평가했는데 추천이 없으면 중간·넓은 범위로 자동 확장합니다. 쿼리 본문, 검색 전략, 정규화 키, 카테고리, 범위, 연속 페이지 토큰, 시도·페이지·중복·판정·실패 집계, 냉각·소진 상태는 SQLite `discovery_query_state`와 실행 진단에 저장됩니다. 검증 카테고리가 검색 카테고리와 일치한 추천 또는 높은 적합도의 안전한 보류 후보에서 카테고리 핵심어를 포함하는 문구만 `discovery_learned_terms`에 탐색 상태로 저장하며, 출처 채널 ID·공개 URL·정규화 근거 신호를 함께 보존합니다. 카테고리 불일치·중복·실패가 많은 검색어는 감점과 냉각을 받습니다. 이 점수와 상태는 발견 순서만 바꾸고 결정 엔진 입력이나 판정 임계값은 바꾸지 않습니다.

`preferredCategory`가 지정되면 선택기는 자동 분류체계, 수동 확장 검색어, 학습 검색어와 기존 SQLite 검색 상태를 모두 해당 카테고리로 필터링합니다. 카테고리 선택이 없는 전체 자동 실행에서만 카테고리별 교대 우선순위를 적용합니다.

H5 리크루팅 근거는 히스토리 선검사와 YouTube 근거 수집을 통과한 신규 신원에만 적용됩니다. 승인 출처 클라이언트의 원본 응답은 어댑터 경계에 남고, 출처 ID·공개 URL·확인 상태·확인 시각을 가진 정규화 연락·소속·국내 적합성 관측값만 `CreatorInput` 조합 경계에 전달됩니다. 미확인·누락·상충 값은 확정 값으로 승격하지 않으며, 확인된 조직 연락처와 소속은 기존 판정 필드에 매핑되어 기존 하드 게이트를 그대로 사용합니다.

H5.1 수집기는 공식 Data API에서 채널 설명, 최근 공개 영상 최대 20개의 제목·설명과 채널 설명에 직접 공개된 외부 링크를 안정적인 스냅샷으로 받습니다. 같은 공개 스냅샷의 채널 제목·설명과 최근 콘텐츠를 가중치 기반으로 분류해 충분한 점수와 선두 격차가 있을 때만 검증 카테고리를 확정합니다. `웹드라마 제작사`, `콘텐츠 제작사`, `프로덕션`, 명시적 법인·기업 공식 문구는 회사 채널 근거가 되지만 채널명에 `STUDIO`가 있다는 사실만으로는 조직을 추론하지 않습니다. 공식 사이트 수집기는 그 정확한 호스트의 공개 HTML과 실제 링크된 허용 페이지만 `robots.txt` 및 유한 요청 제한 아래 확인합니다. HTML과 공식 API 원본 응답은 경계 밖으로 전달하거나 저장하지 않습니다. 이메일 분류는 도메인·주변 문맥·검증된 공식 사이트 근거만 사용하며, 한국어 활동 신호는 시청자 지역과 별도 근거로 유지합니다.

H6는 기존 H4 실행을 `OperationCoordinator` 뒤에서 호출하되 판정 입력과 규칙은 변경하지 않습니다. 예약과 운영 중지 상태, 파일 공유 프로세스 잠금, 실행·이벤트 기록은 SQLite v3 테이블에 저장됩니다. v6~v8은 적합도·재검증, 수동 판정 감사, 마케팅 후속 성과를 순차 추가합니다. 예약기는 `instrumentation.ts`에서 장기 실행 Node.js 프로세스당 한 번 시작되고, 만료된 잠금의 실행은 `interrupted`로 기록한 뒤 기존 히스토리 선검사와 멱등 파이프라인을 통해 복구합니다. 모든 실행과 이벤트는 상관관계 ID를 공유하며 로그 메타데이터는 허용 필드만 보존합니다.

```text
수동 요청 또는 예약 확인
  → 운영 중지 확인 → 실행 시작 간격 제한
  → SQLite 조건부 잠금 획득
  → 상관관계 실행 기록
  → 기존 H4/H4.3/H5.1 파이프라인
  → 성공·오류·중복 통계 기록
  → 잠금 해제와 다음 예약 계산
```

현재 잠금은 같은 SQLite 파일을 공유하는 프로세스만 조정합니다. 결정 010은 장기 실행 Node.js 프로세스 1개와 영속 로컬 SQLite 파일시스템을 승인된 운영 경계로 확정했습니다. 여러 서버나 서버리스 환경의 분산 예약은 지원하지 않습니다.

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
- `localStorage`는 현재 v3 추천 설정과 과거 v2 기록의 일회성 전환 입력으로만 사용하며 서버 판정 원본으로 취급하지 않습니다.
- JSON 내보내기는 읽기 전용 호환 출력이며 파이프라인 입력이 아닙니다.
- 공급자 원본 응답은 정규화 근거와 분리하고 UI·판정 엔진에 직접 전달하지 않습니다.
- 공식 YouTube Data API 원시 응답은 서버 공급자 경계 밖으로 전달하지 않습니다.
- 리크루팅 근거 공급자는 생성 시 명시적으로 허용된 출처 ID만 수락하고 승인되지 않은 출처를 거부합니다.
- H5.1 라이브 수집 범위는 채택된 결정 008의 정확한 출처와 방식으로 제한합니다. 출처 유형 추가나 허구 픽스처는 범위 확대 승인이 아닙니다.
- 운영 배포는 결정 010의 단일 장기 실행 프로세스, 영속 로컬 SQLite, 내부 네트워크와 오프라인 백업 경계를 벗어나지 않습니다.
