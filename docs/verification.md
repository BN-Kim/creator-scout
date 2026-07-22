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

Playwright는 테스트마다 독립 브라우저 컨텍스트를 만들고 테스트 시작 시 `localStorage`와 `sessionStorage`를 초기화합니다. 실패 시 `test-results`에 스크린샷과 트레이스를 남깁니다.

H2부터 Playwright 서버는 `.data/e2e-history.sqlite`를 사용하고 E2E 전용 보호 경로로 각 테스트 전에 서버 히스토리를 초기화합니다. 일반 실행에서는 이 초기화 경로가 404를 반환합니다. SQLite 마이그레이션 버전, 전체 필드 보존, 신원 보강과 반복·경합 쓰기 계약은 `tests/sqlite-history-repository.test.ts`가 검증합니다.

H3 공급자 계층은 실제 네트워크와 키 없이 별도로 실행할 수 있습니다.

```bash
npm run test:providers
```

테스트는 허구 신원과 목 YouTube 응답만 사용하며 공식·InnerTube 공급자 선택, 키 조건, 신원 정규화, 근거 변환, SQLite 사전 확인, 누락 데이터, 길이 표본, 페이지네이션, 타임아웃·재시도·오류 분류와 비밀정보 비노출을 검증합니다. 실제 API 키나 실시간 YouTube 접근은 사용하지 않습니다.

H4 자동 파이프라인은 `tests/scouting/automatic-scouting-pipeline.test.ts`에서 목 공급자만 사용해 비용 순서, 중복 건너뛰기, 세 판정 자동 저장, 통계, 반복 실행 멱등성과 후보별 공급자·저장 실패 격리를 검증합니다. Playwright는 새 추천 실행 제출과 신규 결과 전용 화면도 실제 키 없이 확인합니다.

H5 리크루팅 근거는 `tests/providers/recruitment-evidence-provider.test.ts`에서 승인 출처 허용 목록, 개인·조직 연락처, 소속 유형, 국내 시청자·활동 적합성, 누락·미확인·상충 값, 출처별 확인 시각과 원본 분리를 검증합니다. 자동 파이프라인 테스트는 히스토리 선검사 뒤 신규 신원에만 H5 공급자를 호출하고 반복 실행이 추가 호출이나 히스토리 중복을 만들지 않으며 후보별 실패를 격리하는지 검증합니다. 모든 픽스처는 허구이며 실제 연락처나 실시간 외부 접근을 사용하지 않습니다.
