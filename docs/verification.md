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
