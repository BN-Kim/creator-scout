# 검증 절차

정상적인 코드·설정·문서 변경을 완료한 뒤 다음 단일 명령을 실행합니다.

```bash
npm run verify
```

이 명령은 Windows와 일반 npm 환경에서 순서대로 다음을 실행합니다.

1. `npm run lint` — Next.js ESLint 규칙
2. `npm run test` — Vitest 단위·계약 테스트
3. `npm run typecheck` — strict TypeScript 검사
4. `npm run build` — 프로덕션 Next.js 빌드와 경로 생성

실패를 무시하거나 다음 단계로 건너뛰지 않습니다. UI 동작을 변경하는 작업은 해당 단계가 도입된 뒤 브라우저 스모크 테스트도 추가해야 합니다. 문서만 변경했더라도 링크·명령·현재 상태가 코드와 일치하는지 확인합니다.

브라우저 흐름은 자동 시작되는 전용 Next.js 서버와 Chromium으로 별도 검증합니다.

```bash
npm run test:e2e
```

`scripts/run-playwright.mjs`가 전용 서버를 시작하고 테스트 종료 시 자식 프로세스 트리를 정리하므로 미리 실행 중인 개발 서버에 의존하지 않습니다. Playwright는 테스트마다 독립 브라우저 컨텍스트를 만들고 테스트 시작 시 `localStorage`와 `sessionStorage`를 초기화합니다. 실패 시 `test-results`에 스크린샷과 트레이스를 남깁니다.

현재 Chromium 기준선은 `/insights`를 포함한 필수 경로, 설정 전달, 동기 실행 카운트다운, 실행 복구, 세 판정 그룹, 히스토리 멱등성과 메뉴 리디렉션을 다루는 13개 흐름입니다.

H2부터 Playwright 서버는 `.data/e2e-history.sqlite`를 사용하고 E2E 전용 보호 경로로 각 테스트 전에 서버 히스토리를 초기화합니다. 일반 실행에서는 이 초기화 경로가 404를 반환합니다. SQLite v1~v8 마이그레이션, 전체 필드 보존, 신원 보강과 반복·경합 쓰기 계약은 `tests/sqlite-history-repository.test.ts`가 검증합니다.

H3 공급자 계층은 실제 네트워크와 키 없이 별도로 실행할 수 있습니다.

```bash
npm run test:providers
```

테스트는 허구 신원과 목 YouTube Data API 응답만 사용하며 공식 공급자 키 조건, 신원 정규화, 채널·최근 영상 혼합 검색, RFC 3339 날짜 필터, 영상 수와 평균·절사 평균·중앙값, SQLite 사전 확인, 누락 데이터, 길이 표본, 페이지네이션, 타임아웃·재시도·오류 분류와 비밀정보 비노출을 검증합니다. 실제 API 키나 실시간 YouTube 접근은 사용하지 않습니다.

H4/H4.2/H4.3 자동 파이프라인은 `tests/scouting/automatic-scouting-pipeline.test.ts`의 24개 테스트에서 목 공급자만 사용해 비용 순서, 중복 건너뛰기, 세 판정 자동 저장, 추천 목표 충족, 채널·최근 영상 전략 교대, 다중 페이지·다중 검색어 발견, 목표 초과 방지, 소스 소진, 후보·페이지·시간·공급자 실패 안전 상한, 부분 통계 저장, 반복 실행 멱등성과 후보별 공급자·정규화·저장 실패 격리를 검증합니다. Playwright는 추천 목표만 입력하는 기본 자동 실행, 목표 대비 충족 수, 발견 모드와 중단 사유를 실제 키 없이 확인합니다.

H4.3 자율 발견은 `tests/discovery/h43-discovery.test.ts`의 17개 테스트에서 검색어 없는 자동 실행, 수동 교체·확장과 기존 정규화 키 재사용, 사용자 지정 카테고리 한정, 결정론적 한국어 검색어, 좁은 범위 우선·전체 검색의 카테고리 회전, 검색어별 10명 평가와 연속 페이지 지연, 20명 무추천 뒤 범위 확장, SQLite 진행·집계 영속화, 부분 성과 즉시 반영, 추천과 안전한 고득점 보류의 학습 문구, 불일치·실패 감점, 냉각 후 재활성화를 확인합니다. 모든 발견 테스트는 허구 공급자만 사용하며 실제 YouTube나 외부 AI를 호출하지 않습니다.

공식 공급자와 판정 정확성은 `tests/providers/youtube-evidence-provider.test.ts`, `tests/providers/youtube-data-api-recruitment-client.test.ts`, `tests/providers/creator-category-classifier.test.ts`, `tests/evaluate-creator.test.ts`에서 날짜 구간 지표, 불완전 응답 미확인 처리, 검색·검증 카테고리 분리, 제작사 채널 감지, 점수 구성요소, 동적 경고와 영구 하드 제외를 검증합니다. `tests/contracts/product-invariants.test.ts`는 조직 이메일과 회사·브랜드·공식·재업로드·무효 채널이 점수로 추천되지 않는지, 바이럴 편중만으로 제외되지 않는지 확인합니다. `tests/youtubejs-history-repair.test.ts`는 과거 InnerTube 실행 기록의 역사적 복구 도구만 검증합니다.

H5 리크루팅 근거는 `tests/providers/recruitment-evidence-provider.test.ts`에서 승인 출처 허용 목록, 개인·조직 연락처, 소속 유형, 국내 시청자·활동 적합성, 누락·미확인·상충 값, 출처별 확인 시각과 원본 분리를 검증합니다. 자동 파이프라인 테스트는 히스토리 선검사 뒤 신규 신원에만 H5 공급자를 호출하고 반복 실행이 추가 호출이나 히스토리 중복을 만들지 않으며 후보별 실패를 격리하는지 검증합니다. 모든 픽스처는 허구이며 실제 연락처나 실시간 외부 접근을 사용하지 않습니다.

H5.1 공개 출처 수집은 `tests/providers/live-recruitment-provider.test.ts`, `tests/providers/visible-email-extractor.test.ts`, `tests/providers/youtube-data-api-recruitment-client.test.ts`, `tests/providers/public-web-client.test.ts`에서 검증합니다. 허구 스냅샷과 주입한 목 `fetch`만 사용해 채널·영상 설명 수집, 영상 설명 부분 실패 시 채널 이메일 보존, 공백·전각·제로폭·명시적 `(at)/(dot)` 주소 정규화, 소비자·커스텀 도메인 분류, 승인된 `cj.net` 등록 가능 도메인의 회사 연락처 분류, 반복·복수 개인 연락처 집계, 조직 하드 게이트, `robots.txt`, 로그인·CAPTCHA·401·403·429·타임아웃, 리디렉션·응답 크기, 한국어 활동 신호, 원문 HTML·비밀 비노출을 확인합니다. 자동 파이프라인 테스트는 히스토리 중복이 모든 리크루팅 호출을 건너뛰고 후보별 실패가 격리되는지 확인합니다. 라이브 YouTube·웹사이트·API 키·Docker·SearXNG는 테스트에 사용하지 않습니다.

H6 예약과 운영은 `tests/operations/h6-operations.test.ts`에서 서로 다른 SQLite 연결의 조건부 잠금, 예약 계산, 중복 tick 방지, 제한 재시도와 실행 시작 간격, 만료 실행 복구, 상관관계 로그·모니터링, 운영 중지·재개를 검증합니다. 운영 제어는 사용자 화면에 노출하지 않으며 브라우저 스모크 테스트는 간소화된 메뉴와 `/`, 이전 `/operations` 주소의 스카우트 실행 리디렉션을 검증합니다. E2E에서는 백그라운드 주기 확인만 끄고 동일한 저장소·조정자·API를 사용해 네트워크 없이 결정적으로 실행합니다.

H7은 코드나 외부 인프라를 추가하지 않는 의사결정 체크포인트입니다. [`operations-baseline.md`](operations-baseline.md)와 결정 010이 `database.ts`, SQLite 마이그레이션, `.env.example`, H6 런타임과 일치하는지 검토합니다. 특히 WAL 모드 SQLite 파일 세트, 단일 장기 실행 프로세스, 내부 접근 경계, 24시간 RPO·4시간 RTO·30일 보존과 운영 책임을 확인합니다.

H8 적합도 개편은 `tests/evaluate-creator.test.ts`, `tests/contracts/product-invariants.test.ts`, `tests/reevaluate-automatic-run.test.ts`, `tests/manual-decision-service.test.ts`, `tests/marketing-outcomes.test.ts`에서 점수 판정, 재검증, 수동 우선순위·하드 제외 잠금, 감사 이력과 후속 성과 집계를 검증합니다. 20명 이상 실행의 비동기 응답과 상태 전이는 `tests/operations/h6-operations.test.ts`, 설정 v3와 임계값 조합은 설정·검증 테스트가 확인합니다. 전체 기준선은 Vitest 32개 파일, 260개 테스트입니다.

실제 운영 데이터 검증은 기존 46명 실행을 저장 근거로 재평가해 `0/6/40`에서 `7/30/9`로 변한 퍼널과 조직 이메일 후보 2명의 제외 유지를 확인했습니다. 이 재평가는 새 YouTube API 호출을 하지 않습니다. 로컬 HTTP 스모크는 재평가 결과, 히스토리, 설정, 새 실행, `/insights`, 실행 상태 API가 모두 200인지 확인합니다.
