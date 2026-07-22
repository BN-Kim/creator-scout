# 크리에이터 스카우트 2단계 MVP

YouTube 크리에이터 후보의 확인된 신원과 검증 근거를 결정론적 규칙으로 평가하고, 결과를 내부 히스토리에 자동 기록하는 한국어 운영 대시보드입니다.

## 기술 스택

- Next.js 14 App Router, React 18, TypeScript strict mode
- Tailwind CSS, ESLint, Vitest, Zod
- 브라우저 `localStorage` 기반 히스토리 저장소

## 실행

```bash
npm install
npm run dev
```

`http://localhost:3000`에서 확인할 수 있습니다. 품질 검사는 `npm run lint`, `npm run test`, `npm run typecheck`, `npm run build`로 실행합니다.

## 페이지

- `/`: 전체 검토·추천·보류·제외 요약
- `/runs/new`: 새 목 추천 실행 입력과 검증
- `/runs/[id]`: 세 판정 그룹, 근거, 중복 정보, 수동 교정
- `/history`: 자동 저장 히스토리 검색·필터·정렬과 호환 JSON 다운로드
- `/settings`: Zod로 검증되는 브라우저 로컬 추천 기준

## 판정과 히스토리

사용자에게 노출되는 판정은 `recommended`, `hold`, `excluded`뿐이며 각각 추천, 보류, 제외로 표시됩니다. 회사·에이전시·매니지먼트·MCN·레이블 이메일과 기타 확정 제외 조건은 항상 제외가 됩니다. 미발견·미확인·소유 불명 이메일은 다른 제외 조건이 없을 때 보류가 됩니다. 추천에는 확인된 개인 이메일이 필요합니다.

규칙 엔진은 React 밖의 `src/server/rules`에 있습니다. 히스토리 저장소 인터페이스는 `src/server/history`에, 브라우저 구현은 `src/lib/browser-history-repository.ts`에 있습니다. 다운로드 JSON은 호환 형식인 `channel_name`, `url`, `status`만 포함하지만 데이터 원본은 로컬 히스토리 저장소입니다.

## 목 데이터 제한

현재 24개 레코드는 모두 허구의 시나리오이며 실제 크리에이터, 실제 이메일, 실제 채널 조사 결과가 아닙니다. 외부 API, 검색, 스크래핑, 인증, Redis, Docker, 프로덕션 데이터베이스는 사용하지 않습니다. 로컬 히스토리는 브라우저와 기기에만 저장됩니다.

## 이후 단계

승인된 영속 저장소와 감사 로그를 먼저 도입한 뒤, 별도 지시에 따라 공식 데이터 소스 어댑터를 추가하는 것이 다음 단계입니다.
