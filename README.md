# 크리에이터 스카우트

새로운 YouTube 채널을 자동 발견하고 안정적인 신원으로 정규화한 뒤, SQLite 히스토리에서 과거 처리 여부를 먼저 확인하고 진정으로 새로운 채널만 검증·판정·자동 저장하는 Next.js 운영 애플리케이션입니다. H0~H5.1, YouTube.js 공급자 통합과 H4.2 추천 목표 충족 보정이 완료되었습니다.

## 시작하기

```bash
npm install
npm run dev
```

`http://localhost:3000`에서 실행됩니다.

기본 YouTube 공급자는 API 키가 필요 없는 서버 전용 InnerTube 어댑터입니다. `.env.local`에서 다음 중 하나를 선택할 수 있습니다.

```bash
YOUTUBE_PROVIDER=innertube
```

공식 YouTube Data API v3 어댑터를 선택할 때만 키가 필요합니다.

```bash
YOUTUBE_PROVIDER=official
YOUTUBE_API_KEY=your_key
```

H5.1의 서버 전용 리크루팅 수집기는 정확한 YouTube 채널에 공개된 설명·최근 영상 설명과 그 채널이 직접 연결한 공식 사이트만 확인합니다. `robots.txt`와 요청·페이지·리디렉션·응답 크기·호스트별 속도 제한을 지키며, 게이트된 이메일 버튼이나 로그인·CAPTCHA 우회는 사용하지 않습니다. 선택 설정은 [`.env.example`](.env.example)에 정리되어 있습니다.

새 작업을 시작할 때는 [`AGENTS.md`](AGENTS.md)와 [`docs/index.md`](docs/index.md)를 먼저 읽으세요. 현재 구현 범위는 [`docs/current-status.md`](docs/current-status.md), 이후 단계는 [`docs/development-plan.md`](docs/development-plan.md)에 있습니다.

## 아키텍처 요약

Next.js App Router UI가 애플리케이션 오케스트레이션을 호출하고, 오케스트레이션은 React와 분리된 순수 TypeScript 판정 엔진과 히스토리 저장소 인터페이스를 사용합니다. 히스토리 원본은 서버의 SQLite 파일이며 기본 경로는 `.data/creator-history.sqlite`입니다. H2 이전 목 버전의 v2 `localStorage` 상태는 검증·자동 전송 성공 후 서버 원본으로 한 번 전환됩니다. 24개의 허구 목 시나리오가 판정 흐름을 검증합니다. 자세한 소유권 지도는 [`docs/architecture.md`](docs/architecture.md)를 참고하세요.

목표 자동 파이프라인의 입력 수는 최초 발견 후보 수가 아니라 새로 추천할 크리에이터 수입니다. 목표를 채울 때까지 안전 상한 안에서 후보를 계속 발견하며, 과거·동일 실행 중복, 보류, 제외와 실패는 목표에 포함하지 않습니다. 채널 신원 정규화 직후 비용이 큰 근거 수집 전에 히스토리를 확인하고, 모든 신규 채널의 확정 판정은 자동 저장합니다. 사용자가 히스토리 파일이나 중복 목록을 관리할 필요가 없으며 JSON 다운로드는 선택적 출력입니다.

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

실제 키나 네트워크가 필요 없는 공급자 테스트는 다음과 같습니다.

```bash
npm run test:providers
```

## 현재 제한사항

InnerTube와 공개 HTML은 제공자 구조 변경이나 접근 제한으로 수집이 중단될 수 있으며, 현재 실행 결과 묶음은 서버 재시작 후 복구되지 않습니다. H5.1은 공개적으로 보이는 연락·소속 및 한국어 활동 신호만 다루며, 시청자 지역은 승인된 일차 출처가 없어 계속 미확인입니다. 운영용 외부 데이터베이스, 인증, 예약 작업, 배포 인프라와 AI 분석은 구현되어 있지 않습니다. 현재 SQLite는 단일 서버 파일 배포를 전제로 합니다.
