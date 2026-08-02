# 도달력 점수·영상 형식 분리 작업 인수인계

작성일: 2026-08-02  
대상 저장소: `BN-Kim/creator-scout`  
문서 성격: 다음 작업자를 위한 인수인계 메모이며, 제품 규칙의 정식 원본은 아닙니다. 구현 시 반드시 `AGENTS.md`, `docs/product-rules.md`, `docs/architecture.md`와 새 결정 기록을 함께 갱신해야 합니다.

## 1. 현재 Git 상태

- 작업 브랜치: `codex/marketing-fit-scoring`
- 마지막 커밋: `1fa10a2d1af033bccb28c3cb0eaa121610c8d925`
- 커밋 제목: `feat: add marketing fit scoring and learning loop`
- 원본 저장소: `https://github.com/BN-Kim/creator-scout.git`
- 작업 포크: `https://github.com/hwpjunho611-ctrl/creator-scout.git`
- 열린 PR: `https://github.com/BN-Kim/creator-scout/pull/1`
- 원본 저장소 직접 푸시는 권한 부족으로 403이 발생하므로 포크 브랜치에 푸시한 뒤 PR을 갱신해야 합니다.

현재 PR에 포함된 구현은 100점 마케팅 적합도, 저장 근거 재평가, 수동 판정 감사 이력, 혼합 발견 전략, 대량 실행 백그라운드 처리, 마케팅 후속 성과 및 인사이트 화면입니다.

마지막 완료 검증:

- `npm run verify` 통과
- Vitest 32개 파일, 260개 테스트 통과
- `npm run test:e2e` Chromium 13개 통과
- 주요 페이지와 실행 상태 API HTTP 스모크 테스트 통과
- `.env.local`과 `YOUTUBE_API_KEY`는 커밋되지 않음

## 2. 다른 컴퓨터에서 시작하기

PowerShell 기준:

```powershell
git clone https://github.com/BN-Kim/creator-scout.git
cd creator-scout
git remote add fork https://github.com/hwpjunho611-ctrl/creator-scout.git
git fetch fork
git switch --create codex/marketing-fit-scoring --track fork/codex/marketing-fit-scoring
npm ci
Copy-Item .env.example .env.local
```

`.env.local`에 본인이 발급받은 키를 직접 입력합니다. 실제 키를 문서, 로그, 커밋, 채팅에 남기지 않습니다.

```text
YOUTUBE_API_KEY=본인의_키
```

환경 확인:

```powershell
npm run verify
npm run dev
```

기본 로컬 주소는 `http://localhost:3000`입니다.

## 3. 현재 도달력 정책의 문제

아래 문제는 아직 수정되지 않았습니다.

- 기본 평균 조회수 기준은 5,000회, 중앙값 기준은 3,000회입니다.
- 평균 또는 중앙값 중 하나만 충족해도 도달력 검토를 통과합니다.
- 구독자 대비 효율 조건을 만족하면 중앙값 1,000회로도 도달력 조건을 우회할 수 있습니다.
- 조회수 미달은 추천 불가 조건이 아니라 경고와 점수 감점입니다.
- 도달력 배점이 20점이므로 도달력 점수가 0이어도 나머지 항목에서 최대 80점을 받아 추천 기준 70점을 넘을 수 있습니다.
- 현재 테스트는 다른 강점이 충분하면 낮은 조회수를 상쇄해 추천할 수 있도록 의도적으로 작성되어 있습니다.
- 실제 운영에서는 평균과 중앙값이 수백 회인 저도달 채널이 추천 후보에 포함되는 현상이 확인되었습니다.

관련 코드:

- 기본값과 배점: `src/config/recommendation-rules.ts`
- 조회수 통계와 통과 조건: `src/server/rules/recent-traffic.ts`
- 도달력 점수: `src/server/rules/score-creator-fit.ts`
- 최종 판정: `src/server/rules/evaluate-creator.ts`
- 설정 화면: `src/app/settings/page.tsx`
- 현재 규칙 결정: `docs/decisions/012-marketing-fit-scoring-and-learning-loop.md`

## 4. 합의된 도달력 정책 방향

아래는 논의 결과이며 아직 코드에 반영하지 않았습니다.

### 4.1 안정 도달력과 바이럴 잠재력을 분리

MCN 관점에서 영상 한 편의 대형 조회수는 채널의 콘텐츠 포텐셜을 보여주는 유효한 근거입니다. 따라서 바이럴 편중을 일괄 감점하지 않습니다. 대신 다음 두 축을 분리합니다.

- 상업적 안정성: 반복적으로 확보할 수 있는 조회수
- 브레이크아웃 잠재력: 한 편 또는 소수 영상이 크게 성장한 능력

한 편만 터지고 나머지가 수백 회인 채널은 육성 잠재력이 있지만, 평균 1만 회를 근거로 즉시 광고 협상을 시작할 수 있는 채널은 아닙니다. 이런 채널은 `recommended`가 아니라 잠재력 높은 `hold`가 적합합니다.

### 4.2 권장 도달력 35점 구성

| 구성 | 권장 배점 |
| --- | ---: |
| 최근 절사 평균 조회수 | 15 |
| 브레이크아웃 잠재력 | 10 |
| 중앙 조회수 | 5 |
| 조회수/구독자 효율 | 5 |

전체 100점 예시:

| 구성 | 권장 배점 |
| --- | ---: |
| 카테고리 적합성 | 20 |
| 한국 시장 활동 | 15 |
| 활동성·일관성 | 15 |
| 도달력·효율 | 35 |
| 진정성·위험 | 10 |
| 연락 가능성 | 5 |

### 4.3 추천 자격과 판정

초기 권장안:

- 최근 유효 표본 최소 5개
- 협상 가능 추천의 주된 강제 조건은 최근 절사 평균 10,000회 이상
- 중앙값은 강한 배제 조건이 아니라 약 3,000회의 최소 방어선과 5점 배점으로 사용
- 절사 평균과 중앙값이 모두 수백 회이고 표본이 충분하면 동적 제외
- 절사 평균은 낮지만 최근 최고 영상 또는 상위 2개 영상이 강하면 잠재력 높은 보류
- 조회수 근거가 불완전하면 0으로 변환하지 않고 보류
- 조직 이메일과 회사·공식·재업로드 등 기존 영구 하드 제외는 그대로 유지

브레이크아웃 잠재력은 단순 최고 조회수만 쓰지 않고 아래 신호를 함께 검토해야 합니다.

- 최근 10개 중 최고 조회수
- 상위 2개 평균
- 최고 조회수와 중앙값의 배수
- 바이럴 영상의 게시 시점
- 같은 주제 후속 영상의 반복 성과

## 5. Shorts와 롱폼 분리의 기술 검증

### 5.1 현재 구현

현재 공급자는 `videos.list`에서 `snippet,statistics,contentDetails`를 받고 `contentDetails.duration`만 사용합니다.

- 180초 이하: `shorts_length`
- 180초 초과: `long_form_length`

구현 위치: `src/server/providers/youtube/youtube-data-api-provider.ts`

이 방식은 가로형 2분 영상도 Shorts로 오분류합니다.

### 5.2 공개 API로 가능한 개선

YouTube Data API v3의 공개 `player.embedWidth`와 `player.embedHeight`를 사용하면 실제 표시 화면비를 간접 계산할 수 있습니다.

기존 `videos.list` 요청에 다음을 추가합니다.

```text
part=snippet,statistics,contentDetails,player
maxWidth=1000
maxHeight=1000
```

계산:

```text
aspectRatio = embedWidth / embedHeight
```

같은 `videos.list` 요청에 포함할 수 있으므로 영상별 추가 호출은 필요하지 않습니다. `videos.list` 호출 비용은 공식 문서 기준 1단위입니다.

공식 문서:

- https://developers.google.com/youtube/v3/docs/videos
- https://developers.google.com/youtube/v3/docs/videos/list
- https://support.google.com/youtube/answer/15424877?hl=en-GB

### 5.3 2026-08-02 실 API 확인 결과

로컬 `.env.local`의 키를 출력하지 않고 공개 영상 응답만 확인했습니다.

| 표본 | 길이 | `embedWidth × embedHeight` | 계산 비율 |
| --- | ---: | ---: | ---: |
| 최근 실제 Shorts 5개 | 21~101초 | 563 × 1000 | 0.563 |
| 일반 가로형 뮤직비디오 | 3분 34초 | 1000 × 563 | 1.776 |
| 19초 가로형 일반 영상 | 19초 | 1000 × 750 | 1.333 |

이 결과로 `길이만 짧은 가로 영상`과 `세로 Shorts`를 구분할 수 있음을 확인했습니다.

### 5.4 권장 분류 규칙

일반 채널의 최근 영상 기준:

- `durationSeconds <= 180`
- `aspectRatio <= 1.05`의 세로 또는 정사각형 영상
- 게시일이 2024-10-15 이후

세 조건을 충족하면 `shorts`로 분류합니다.

- 길이 180초 초과: `long_form`
- 길이 180초 이하이지만 화면비 1.05 초과: `short_horizontal` 또는 롱폼 집계
- 화면비 또는 길이 없음: `unknown`

`fileDetails.videoStreams.aspectRatio`는 더 직접적이지만 영상 소유자만 조회할 수 있으므로 타 채널 스카우팅에는 사용할 수 없습니다. 썸네일 크기도 표준화되어 실제 영상 화면비 판정에 사용하면 안 됩니다.

`player` 화면비는 공식 `isShort` 값이 아니라 간접 판별입니다. 응답 누락, 기본 4:3 처리 등 불확실한 사례는 추정하지 말고 `unknown`으로 남겨야 합니다.

## 6. 형식별 조회수 평가 권장안

- 롱폼 조회수 배열과 Shorts 조회수 배열을 별도로 보존합니다.
- 혼합 채널의 두 형식 조회수를 합쳐 평균내지 않습니다.
- 롱폼 표본이 5개 이상이면 롱폼만으로 절사 평균, 중앙값, 최고 및 상위 2개 평균을 계산합니다.
- Shorts도 별도 통계를 계산하지만 추천 임계값은 실제 데이터 백테스트 후 정합니다.
- 형식별 표본이 부족하면 해당 형식의 결과를 `unknown` 또는 보류로 처리합니다.
- 2025-03-31 이후 Shorts의 공개 `viewCount`는 최소 시청시간 없이 재생 또는 재재생 시작 횟수이므로 롱폼 조회수와 같은 값으로 비교하면 안 됩니다.

기존 46명 저장 근거에는 영상별 화면비가 없습니다. 따라서 기존 저장 근거만 재평가해서 정확한 형식 분리를 백테스트할 수는 없습니다. 새 공급자 필드 적용 후 새 데이터로 검증하거나, 명시적인 새 API 수집 작업을 별도로 수행해야 합니다. 저장 근거 재평가 기능이 암묵적으로 API를 재호출하게 만들면 안 됩니다.

## 7. 다음 구현 순서

1. 새 결정 기록 `docs/decisions/013-reach-readiness-and-video-format.md` 작성
2. 규칙 버전을 `2026-08-marketing-fit-v2`로 분리
3. `NormalizedVideoEvidence`에 화면비 원본과 분류 결과 및 신뢰도 추가
4. 기존 `videos.list` 요청에 `player`, `maxWidth`, `maxHeight` 추가
5. 순수 TypeScript 형식 분류기를 별도 모듈로 작성
6. 최근 영상 근거에 롱폼·Shorts별 조회수 표본을 별도로 보존
7. 조회수 통계를 형식별로 계산하고 브레이크아웃 잠재력 구성요소 추가
8. 추천 자격에 절사 평균 10,000회와 최소 표본 조건 적용
9. 중앙값 배점을 5점 수준으로 낮추고 최소 방어선으로 사용
10. 설정 화면에 롱폼·Shorts 기준과 형식 미확인 상태를 명확한 한국어로 표시
11. 새 데이터로 백테스트하고 추천·보류·제외 변화 확인
12. `docs/product-rules.md`, `docs/current-status.md`, 테스트와 결정 기록 갱신

## 8. 필수 테스트 시나리오

- 세로 60초 영상은 Shorts
- 정사각형 180초 영상은 Shorts
- 가로 19초 영상은 Shorts가 아님
- 181초 세로 영상은 롱폼
- 화면비 누락은 `unknown`
- 조회수 누락을 0으로 변환하지 않음
- 롱폼과 Shorts의 평균을 섞지 않음
- 절사 평균·중앙값 수백 회인 채널은 추천되지 않음
- 낮은 평시 조회수와 강한 한 편이 있는 채널은 잠재력 높은 보류
- 롱폼 절사 평균 10,000회 이상, 중앙값 방어선, 연락처 및 필수 근거를 모두 충족하면 추천
- 조직 이메일과 영구 하드 제외는 높은 조회수보다 항상 우선
- 과거 저장 근거 재평가는 API를 호출하지 않음

완료 후 실행:

```powershell
npm run verify
npm run test:e2e
git diff --check
```

## 9. PR 갱신 방법

변경을 완료하면 현재 브랜치에 커밋하고 포크로 푸시합니다.

```powershell
git add -A
git commit -m "feat: strengthen reach scoring and split video formats"
git push fork codex/marketing-fit-scoring
```

기존 PR #1이 자동으로 갱신됩니다. 새로운 PR을 만들 필요가 없습니다.
