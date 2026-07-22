# 제품 규칙

이 문서는 크리에이터 판정 업무 규칙의 유일한 사람이 읽을 수 있는 기준입니다. 구현은 `src/server/rules`, 계약은 `tests/contracts`가 보호합니다.

## 판정 모델

허용되는 판정은 다음 세 값뿐입니다.

- `recommended` — 추천
- `hold` — 보류
- `excluded` — 제외

명시적인 제품 결정 없이는 새로운 크리에이터 판정 상태를 추가하지 않습니다. 사유, 경고, 누락 근거, 중복과 수동 교정은 별도 필드로 표현합니다.

## 추천

추천은 모든 필수 검사를 통과해야 합니다. 확인된 YouTube 크리에이터 신원과 채널 또는 핸들 URL, 영상 존재, 설정된 기간 내 최근 활동, 최소 최근 영상 수, 충분한 최근 조회 성과, 카테고리 일치, 적절한 국내 시청자 적합성, 확인된 개인 소유로 보이는 공개 이메일이 필요합니다. 확정 제외 조건, 기존 히스토리 중복, 동일 실행 중복 또는 무효 수동 교정이 없어야 합니다.

## 보류

보류는 잠재적으로 적합하고 확정 제외 조건이 없지만 비치명적인 사실이 하나 이상 확인되지 않았을 때만 허용됩니다. 이메일 미발견, 미확인 또는 소유 유형 불명은 다른 확정 제외 조건이 없다면 보류가 될 수 있습니다.

## 제외와 하드 게이트

확정된 하드 게이트는 모든 추천 신호와 보류 조건보다 우선합니다. 회사, 에이전시, 매니지먼트, MCN, 레이블 또는 대표 조직의 이메일은 항상 제외입니다. 기존 히스토리 중복, 동일 실행 중복과 사용자의 무효 교정도 제외입니다. 그 밖의 하드 게이트와 사유 코드는 `src/config/recommendation-rules.ts`의 `exclusionReasonMappings`와 `src/server/rules/reason-codes.ts`가 소유합니다.

## 증거 무결성

크리에이터 신원, 채널 URL, 이메일, 구독자 수, 조회수, 업로드 날짜, 카테고리, 시청자 위치, 소속 또는 검증 근거를 만들어내거나 근거 없이 추론하지 않습니다. 확인하지 않은 값은 `null`, `not_checked` 등 명시적인 미확인 상태로 유지합니다. 검색 결과 URL과 영상 URL은 채널 신원을 확립하지 않습니다.

## 히스토리

히스토리는 애플리케이션의 내부 기억입니다. 추천 전에 모든 크리에이터를 히스토리와 비교하고, 확정된 판정을 자동 기록합니다. 판정 매핑은 고정입니다.

- `recommended` → `recommended`
- `hold` → `candidate`
- `excluded` → `excluded`

저장소가 원본이며 다운로드 JSON은 호환 출력일 뿐입니다.

## 규칙 소유권

| 규칙 종류 | 소유 모듈 |
| --- | --- |
| 하드 게이트와 우선순위 | `src/server/rules/evaluate-creator.ts`, `src/config/recommendation-rules.ts` |
| 활동·조회 임계값 | `src/config/recommendation-rules.ts` |
| 최근 조회 계산 | `src/server/rules/recent-traffic.ts` |
| 증거 필드와 판정 타입 | `src/types/domain.ts` |
| UI 한국어 라벨 | `src/config/labels.ts` |
| 사유 코드와 한국어 설명 | `src/server/rules/reason-codes.ts` |
| 판정-히스토리 호환 매핑 | `src/server/history/history-record.ts` |
| 3필드 JSON 호환 형식 | `src/lib/creators.ts`, `src/types/domain.ts` |

설정 기본값은 활동 기간 56일, 최소 최근 영상 2개, 기본 최근 조회 표본 5개, 확장 표본 최대 10개, 최소 평균 조회 10,000입니다. 구독자 임계값은 기본적으로 설정하지 않습니다.
