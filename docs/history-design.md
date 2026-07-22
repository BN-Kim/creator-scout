# 히스토리 설계

히스토리의 제품 불변 조건은 [`product-rules.md`](product-rules.md), 전체 책임 지도는 [`architecture.md`](architecture.md)를 참고하세요.

현재 `HistoryRepository`는 로드, 검색, 필터, 중복 확인, 추가·갱신, 교체 계약을 정의합니다. `SqliteHistoryRepository`가 서버 원본 구현이며 Next.js API를 통해 UI에 제공됩니다. `BrowserHistoryRepository`는 현재 v2 브라우저 기록의 일회성 전환 호환에만 남아 있습니다. 신원은 채널 ID, 확인된 정규 URL, 핸들, 확인 별칭, 정규화된 정확한 채널명 순서로 비교하며 검색·영상 URL은 신원으로 사용하지 않습니다.

동일 신원은 새 레코드를 반복 생성하지 않고 기존 레코드를 갱신합니다. 더 강한 신원 근거가 확인되면 기존 미확인 필드를 보강합니다. 다운로드 JSON은 `channel_name`, `url`, `status`만 제공하는 호환 출력이며 저장소 원본이 아닙니다.

SQLite 스키마는 판정 레코드와 고유 신원 키를 분리합니다. 신원 키 고유 제약과 즉시 쓰기 트랜잭션이 반복·경합 쓰기의 중복을 방지합니다. 마이그레이션은 버전 순서대로 트랜잭션 적용되고 `schema_migrations`에 기록됩니다. 데이터베이스 선택과 롤백은 [`decisions/006-sqlite-server-history.md`](decisions/006-sqlite-server-history.md)를 참고하세요.
