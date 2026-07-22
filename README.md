# 크리에이터 스카우트

새로운 YouTube 채널을 자동 발견하고 안정적인 신원으로 정규화한 뒤, SQLite 히스토리에서 과거 처리 여부를 먼저 확인하고 진정으로 새로운 채널만 검증·판정·자동 저장하는 Next.js 운영 애플리케이션입니다. 현재 단계는 실제 외부 데이터를 사용하지 않는 목 애플리케이션이며 H0 하네스, H1 UI 스모크 테스트와 H2 서버 영속 히스토리가 완료되었습니다.

## 시작하기

```bash
npm install
npm run dev
```

`http://localhost:3000`에서 실행됩니다.

새 작업을 시작할 때는 [`AGENTS.md`](AGENTS.md)와 [`docs/index.md`](docs/index.md)를 먼저 읽으세요. 현재 구현 범위는 [`docs/current-status.md`](docs/current-status.md), 이후 단계는 [`docs/development-plan.md`](docs/development-plan.md)에 있습니다.

## 아키텍처 요약

Next.js App Router UI가 애플리케이션 오케스트레이션을 호출하고, 오케스트레이션은 React와 분리된 순수 TypeScript 판정 엔진과 히스토리 저장소 인터페이스를 사용합니다. 히스토리 원본은 서버의 SQLite 파일이며 기본 경로는 `.data/creator-history.sqlite`입니다. H2 이전 목 버전의 v2 `localStorage` 상태는 검증·자동 전송 성공 후 서버 원본으로 한 번 전환됩니다. 24개의 허구 목 시나리오가 판정 흐름을 검증합니다. 자세한 소유권 지도는 [`docs/architecture.md`](docs/architecture.md)를 참고하세요.

목표 자동 파이프라인은 채널 신원 정규화 직후 비용이 큰 근거 수집 전에 히스토리를 확인합니다. 과거 일치는 새 제외 판정이 아니라 조용히 건너뛰는 파이프라인 동작이며 내부 실행 통계에만 집계합니다. 모든 신규 채널의 확정 판정은 자동 저장되고 현재 실행에는 새로 처리한 결과만 표시됩니다. 사용자가 히스토리 파일이나 중복 목록을 관리할 필요가 없으며 JSON 다운로드는 선택적 출력입니다.

## 검증

일반적인 변경의 필수 최종 명령은 다음과 같습니다.

```bash
npm run verify
```

개별 명령인 `npm run lint`, `npm run test`, `npm run typecheck`, `npm run build`도 유지됩니다.

실제 Chromium 사용자 흐름은 별도로 실행합니다.

```bash
npm run test:e2e
```

## 현재 제한사항

실제 YouTube 탐색·검증, 자동 실행 파이프라인, 이메일 수집, 실시간 시청자 분석, 운영용 외부 데이터베이스, 인증, 예약 작업, 배포 인프라와 AI 분석은 구현되어 있지 않습니다. 현재 SQLite는 단일 서버 파일 배포를 전제로 합니다.
