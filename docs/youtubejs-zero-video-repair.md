# YouTube.js 영상 0개 오판 복구

이 명령은 LockupView 파서 수정 시각인 `2026-07-22T12:33:50.068Z` 이전에 생성된 제외 레코드 중 다음 조건을 모두 만족하는 항목만 다룹니다.

- 운영자가 `--innertube-run-id`로 명시한 `youtubejs_innertube` 실행
- YouTube 채널 ID가 있는 자동 실행 레코드
- 근거 요약에 확인된 최근 영상 수 0개가 기록됨
- `insufficient_recent_video_count` 제외 사유가 있음

수정 전 히스토리 스키마에는 공급자 출처가 별도 열로 저장되지 않았으므로 실행 ID를 자동 추정하지 않습니다. 먼저 해당 실행이 InnerTube 공급자를 사용했는지 확인해야 합니다.

## Dry-run

`--apply`를 생략하면 읽기 전용으로 후보의 채널 ID, 이름, 생성일, 사유와 실행 ID를 출력합니다.

```bash
npm run history:repair-youtubejs-zero-videos -- --innertube-run-id <확인한-실행-ID>
```

출력된 항목은 복구 후보일 뿐 자동으로 오판이 확정된 것은 아닙니다. 각 채널의 공개 영상이 실제로 존재하고 기존 0개 판정이 파서 오류였는지 확인하세요.

## 명시적 적용

확인된 채널만 `--confirm-channel-id`로 지정하고 `--apply`를 추가합니다. 지정하지 않은 레코드와 다른 실행의 레코드는 변경하지 않습니다.

```bash
npm run history:repair-youtubejs-zero-videos -- --innertube-run-id <확인한-실행-ID> --confirm-channel-id <확인한-채널-ID> --apply
```

적용은 해당 오판 히스토리 레코드를 제거해 이후 자동 실행에서 같은 채널을 다시 평가할 수 있게 합니다. 적용 후 새 추천 실행의 검색어에 확인한 채널명 또는 핸들을 사용해 재실행하고, 새 영상 근거와 판정을 검토하세요. 여러 채널은 `--confirm-channel-id`를 반복해 지정합니다. 백업과 dry-run 검토 없이 `--apply`를 사용하지 마세요.
