# 크리에이터 스카우트

확인된 크리에이터 신원과 검증 근거를 결정론적 규칙으로 평가하고, 추천·보류·제외 결과를 내부 히스토리에 기록하는 Next.js 운영 애플리케이션입니다. 현재 단계는 실제 외부 데이터를 사용하지 않는 2단계 목 애플리케이션과 H0 하네스 기준선입니다.

## 시작하기

```bash
npm install
npm run dev
```

`http://localhost:3000`에서 실행됩니다.

새 작업을 시작할 때는 [`AGENTS.md`](AGENTS.md)와 [`docs/index.md`](docs/index.md)를 먼저 읽으세요. 현재 구현 범위는 [`docs/current-status.md`](docs/current-status.md), 이후 단계는 [`docs/development-plan.md`](docs/development-plan.md)에 있습니다.

## 아키텍처 요약

Next.js App Router UI가 애플리케이션 오케스트레이션을 호출하고, 오케스트레이션은 React와 분리된 순수 TypeScript 판정 엔진과 히스토리 저장소 인터페이스를 사용합니다. 현재 저장소 구현은 브라우저 `localStorage`이며, 24개의 허구 목 시나리오가 판정 흐름을 검증합니다. 자세한 소유권 지도는 [`docs/architecture.md`](docs/architecture.md)를 참고하세요.

## 검증

일반적인 변경의 필수 최종 명령은 다음과 같습니다.

```bash
npm run verify
```

개별 명령인 `npm run lint`, `npm run test`, `npm run typecheck`, `npm run build`도 유지됩니다.

## 현재 제한사항

실제 YouTube 탐색·검증, 이메일 수집, 실시간 시청자 분석, 서버 데이터베이스, 인증, 예약 작업, 배포 인프라와 AI 분석은 구현되어 있지 않습니다. 히스토리는 현재 브라우저와 기기에만 저장되며 실제 과거 크리에이터 목록은 가져오지 않았습니다.
