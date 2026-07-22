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

H2부터 Playwright 서버는 `.data/e2e-history.sqlite`를 사용하고 E2E 전용 보호 경로로 각 테스트 전에 서버 히스토리를 초기화합니다. 일반 실행에서는 이 초기화 경로가 404를 반환합니다. SQLite 마이그레이션 버전, 전체 필드 보존, 신원 보강과 반복·경합 쓰기 계약은 `tests/sqlite-history-repository.test.ts`가 검증합니다.

H3 공급자 계층은 실제 네트워크와 키 없이 별도로 실행할 수 있습니다.

```bash
npm run test:providers
```

테스트는 허구 신원과 목 YouTube 응답만 사용하며 공식·InnerTube 공급자 선택, 키 조건, 신원 정규화, 근거 변환, SQLite 사전 확인, 누락 데이터, 길이 표본, 페이지네이션, 타임아웃·재시도·오류 분류와 비밀정보 비노출을 검증합니다. 실제 API 키나 실시간 YouTube 접근은 사용하지 않습니다.

H4/H4.2/H4.3 자동 파이프라인은 `tests/scouting/automatic-scouting-pipeline.test.ts`의 21개 테스트에서 목 공급자만 사용해 비용 순서, 중복 건너뛰기, 세 판정 자동 저장, 추천 목표 충족, 다중 페이지·다중 검색어 발견, 목표 초과 방지, 소스 소진, 후보·페이지·시간·공급자 실패 안전 상한, 반복 실행 멱등성과 후보별 공급자·정규화·저장 실패 격리를 검증합니다. Playwright는 추천 목표만 입력하는 기본 자동 실행, 목표 대비 충족 수, 발견 모드와 중단 사유를 실제 키 없이 확인합니다.

H4.3 자율 발견은 `tests/discovery/h43-discovery.test.ts`의 11개 테스트에서 검색어 없는 자동 실행, 수동 교체·확장과 기존 정규화 키 재사용, 결정론적 한국어 검색어, 좁은 범위 우선·카테고리 회전, 검증·저표본·새 검색어 탐색 회전, SQLite 연속 페이지와 집계 영속화, 최소 표본 품질 점수, 추천 공개 메타데이터 전용 학습 문구, 성과 기반 검증·냉각 상태와 소진 쿼리의 냉각 후 재활성화를 확인합니다. 모든 발견 테스트는 허구 공급자만 사용하며 실제 YouTube나 외부 AI를 호출하지 않습니다.

공급자 정확성 hotfix는 `tests/providers/youtubejs-video-normalization.test.ts`, `tests/providers/innertube-provider.test.ts`, `tests/evaluate-creator.test.ts`, `tests/youtubejs-history-repair.test.ts`에서 LockupView 식별자와 유형, 영상 목록 상태, 비호환 무판정·무저장, 신원·국내 활동·시청자·소속·연락처 게이트, 분리된 사유 표시와 복구 명령을 검증합니다.

H5 리크루팅 근거는 `tests/providers/recruitment-evidence-provider.test.ts`에서 승인 출처 허용 목록, 개인·조직 연락처, 소속 유형, 국내 시청자·활동 적합성, 누락·미확인·상충 값, 출처별 확인 시각과 원본 분리를 검증합니다. 자동 파이프라인 테스트는 히스토리 선검사 뒤 신규 신원에만 H5 공급자를 호출하고 반복 실행이 추가 호출이나 히스토리 중복을 만들지 않으며 후보별 실패를 격리하는지 검증합니다. 모든 픽스처는 허구이며 실제 연락처나 실시간 외부 접근을 사용하지 않습니다.

H5.1 공개 출처 수집은 `tests/providers/live-recruitment-provider.test.ts`와 `tests/providers/public-web-client.test.ts`에서 검증합니다. 허구 스냅샷과 주입한 목 `fetch`만 사용해 소비자·커스텀 도메인 분류, 조직 하드 게이트, `robots.txt`, 로그인·CAPTCHA·401·403·429·타임아웃, 리디렉션·응답 크기, 한국어 활동 신호, 원문 HTML·비밀 비노출을 확인합니다. 자동 파이프라인 테스트는 히스토리 중복이 모든 리크루팅 호출을 건너뛰고 후보별 실패가 격리되는지 확인합니다. 라이브 YouTube·웹사이트·API 키·Docker·SearXNG는 테스트에 사용하지 않습니다.

H6 예약과 운영은 `tests/operations/h6-operations.test.ts`에서 서로 다른 SQLite 연결의 조건부 잠금, 예약 계산, 중복 tick 방지, 제한 재시도와 실행 시작 간격, 만료 실행 복구, 상관관계 로그·모니터링, 운영 중지·재개를 검증합니다. 브라우저 스모크 테스트는 `/operations`에서 중지·재개, 예약 생성과 활성 상태 변경을 검증합니다. E2E에서는 백그라운드 주기 확인만 끄고 동일한 저장소·조정자·API를 사용해 네트워크 없이 결정적으로 실행합니다.

H7은 코드나 외부 인프라를 추가하지 않는 의사결정 체크포인트입니다. [`operations-baseline.md`](operations-baseline.md)와 결정 010이 `database.ts`, 마이그레이션 v1~v3, `.env.example`, H6 런타임과 일치하는지 검토합니다. 특히 WAL 모드 SQLite 파일 세트, 단일 장기 실행 프로세스, 내부 접근 경계, 24시간 RPO·4시간 RTO·30일 보존과 운영 책임을 확인합니다. 기존 제품 계약의 비변경은 전체 Vitest와 Playwright 회귀 기준선으로 검증합니다.
