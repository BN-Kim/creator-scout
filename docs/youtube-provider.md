# YouTube 신원 및 근거 공급자

H3 공급자 계층은 `src/server/providers/youtube`가 소유합니다. 후보 발견, 안정적 신원 확인, 채널 근거, 최근 영상 근거는 각각 인터페이스로 분리됩니다. 서버 전용 `InnerTubeYouTubeProvider`와 공식 `YouTubeDataApiProvider`가 같은 계약을 구현하며 UI와 결정론적 판정 엔진은 공급자 원시 응답에 의존하지 않습니다.

## 공급자 선택

- `YOUTUBE_PROVIDER=innertube` — 기본값. `youtubei.js`의 비인증 공개 InnerTube 세션을 사용하며 API 키가 필요하지 않습니다.
- `YOUTUBE_PROVIDER=official` — YouTube Data API v3를 사용하며 `YOUTUBE_API_KEY`가 필요합니다.

InnerTube 실행은 `youtubejs-runtime.ts`에서만 `youtubei.js`를 로드합니다. 이 파일은 `server-only`로 보호되며 클라이언트 컴포넌트에서 실행하지 않습니다. 쿠키, 계정 인증, CAPTCHA 우회, 프록시 순환, 지문 회피, 다운로드와 비공개 정보 수집은 사용하지 않습니다.

## 신원 정규화

지원 입력은 다음과 같습니다.

- `UC`로 시작하는 24자 채널 ID
- `@handle` 또는 접두사 없는 핸들
- `youtube.com/channel/{channelId}`
- `youtube.com/@handle`
- `youtube.com/user/{legacyUsername}`

성공한 확인은 반드시 안정적인 YouTube 채널 ID, `youtube.com/channel/{channelId}` 정규 URL, 확인된 채널명과 가능한 경우 핸들을 반환합니다. 검색 URL, 영상 URL, 임의 `/c/` URL, 외부 도메인과 채널명은 안정적 신원으로 사용하지 않습니다. 채널명 일치는 히스토리 사전 확인에도 사용하지 않습니다.

## 원본과 정규화 경계

모든 공급자 결과는 `raw`와 정규화 결과를 별도 필드로 반환합니다. YouTube.js 파서 객체 접근은 런타임 브리지가 안정적인 원시 스냅샷으로 격리하고, H3 어댑터는 이 스냅샷만 도메인 근거로 변환합니다. 원본 응답은 판정 엔진에 직접 전달하지 않습니다. 숨겨진 구독자 수, 상대 날짜, 누락 조회수·지속시간, 삭제되었거나 조회할 수 없는 영상은 각각 `null` 또는 `unavailableVideoIds`로 보존합니다.

YouTube Data API는 Shorts 노출 여부를 직접 제공하지 않습니다. H3는 제공된 ISO 8601 지속시간으로 `shorts_length`(180초 이하), `long_form_length`(180초 초과), `unknown` 표본만 파생합니다. `shorts_length`는 Shorts 노출 확정이 아니라 길이 기반 표본입니다. 기존 `VerificationEvidence` 변환은 이 파생 근거와 미확인 값을 명시적으로 보존합니다.

## 히스토리 사전 확인

`HistoryPrecheckedYouTubeEvidenceCollector`는 단일 후보에 대해 다음 경계를 강제합니다.

1. 공급자로 안정적 채널 ID를 확인합니다.
2. 정확한 채널 ID와 그 ID에서 파생한 정규 채널 URL만 사용해 SQLite 히스토리를 확인합니다. 채널명과 핸들 유사성은 사전 확인 근거로 사용하지 않습니다.
3. 과거 일치면 `skipped_history`와 기존 레코드 ID를 반환합니다.
4. 건너뛴 후보는 채널·영상 근거를 조회하지 않고 판정이나 히스토리 쓰기를 수행하지 않습니다.
5. 신규 신원만 채널과 최근 영상 근거를 수집해 `evidence_collected`를 반환합니다.

이 단일 후보 경계는 H4 배치 파이프라인과 독립적으로 테스트됩니다. H4는 같은 안정적 신원·근거 공급자 계약을 사용해 실행 통계, 동일 실행 블록리스트, 판정 호출과 자동 저장을 담당합니다.

## 오류와 신뢰성

`YouTubeProviderError`는 다음 범주를 제공합니다.

- `configuration`
- `invalid_input`
- `not_found`
- `quota_exceeded`
- `rate_limited`
- `unauthorized`
- `timeout`
- `temporary`
- `response_invalid`
- `access_restricted`
- `provider_incompatible`

타임아웃, 일시적인 5xx 오류와 속도 제한만 설정된 횟수 안에서 재시도합니다. 잘못된 입력, 미발견, 인증 실패, 할당량 소진과 잘못된 응답은 반복하지 않습니다. 로그에는 작업명, 시도 횟수, 상태 코드와 오류 범주만 포함하며 요청 URL, 쿼리 매개변수와 API 키를 기록하지 않습니다. 반환 오류도 공급자 원문이나 내부 원인 객체를 노출하지 않습니다.

## 환경 설정

- `YOUTUBE_PROVIDER` — 선택, 기본 `innertube`, 허용값 `innertube` 또는 `official`
- `YOUTUBE_API_KEY` — `official` 선택 시에만 필수
- `YOUTUBE_REQUEST_TIMEOUT_MS` — 선택, 기본 10초
- `YOUTUBE_MAX_RETRIES` — 선택, 기본 2회, 최대 5회

알 수 없는 공급자, 공식 공급자의 키 누락 또는 숫자 설정 범위 오류는 외부 요청 전에 `configuration` 오류가 됩니다. 실제 값은 `.env.local` 같은 커밋되지 않는 환경 파일에만 둡니다.

## 테스트 전략과 제한사항

`npm run test:providers`는 허구 채널 ID, 목 HTTP 응답과 목 InnerTube 클라이언트 스냅샷만 사용합니다. 공급자 선택, 키 조건, 신원 입력, 페이지네이션, 채널·영상 정규화, 누락·삭제 영상, 길이 표본 분리, SQLite 사전 건너뛰기, H4 멱등성, 타임아웃·재시도·오류 분류와 비밀정보 비노출을 검증합니다. 실제 API 키나 네트워크가 필요하지 않습니다.

공급자 계층은 H4 파이프라인의 중복 선검사, 실행 통계, 평가와 자동 저장을 그대로 재사용합니다. 이메일 수집, 실제 시청자·소속 근거, 스케줄링과 운영 제어는 이 공급자 작업에 포함되지 않습니다.
