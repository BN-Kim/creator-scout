# 프로젝트 결정 기록

이 디렉터리는 현재 프로젝트의 명시적인 제품·아키텍처 결정을 기록합니다. 과거 토론을 재구성하지 않고 현재 기준과 재검토 조건만 설명합니다.

- [`001-three-decision-model.md`](001-three-decision-model.md) — 세 판정 모델
- [`002-organization-email-exclusion.md`](002-organization-email-exclusion.md) — 조직 이메일 강제 제외
- [`003-history-repository-abstraction.md`](003-history-repository-abstraction.md) — 저장소 추상화
- [`004-localstorage-is-temporary.md`](004-localstorage-is-temporary.md) — localStorage의 임시 성격
- [`005-hard-gates-override-positive-signals.md`](005-hard-gates-override-positive-signals.md) — 하드 게이트 우선
- [`006-sqlite-server-history.md`](006-sqlite-server-history.md) — H2 SQLite 서버 히스토리
- [`007-automatic-history-and-precheck.md`](007-automatic-history-and-precheck.md) — 자동 히스토리와 검증 전 중복 건너뛰기
- [`008-live-recruitment-source-approval-required.md`](008-live-recruitment-source-approval-required.md) — H5.1 공개 출처와 제한된 수집 방식 승인
- [`009-h6-sqlite-operations.md`](009-h6-sqlite-operations.md) — H6 단일 서버 예약·잠금·복구 경계
- [`010-h7-production-operating-boundary.md`](010-h7-production-operating-boundary.md) — H7 단일 호스트 운영·백업·접근 제어 기준
- [`011-official-youtube-data-api-only.md`](011-official-youtube-data-api-only.md) — 공식 YouTube Data API v3 전용 수집과 최근 기간 지표 정의

결정 변경은 [`product-rules.md`](../product-rules.md), 계약 테스트와 현재 상태 문서를 함께 갱신해야 합니다.
