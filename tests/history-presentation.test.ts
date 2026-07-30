import { describe, expect, it } from "vitest";
import { formatHistoryReasonLines } from "@/lib/history-presentation";

describe("history reason presentation", () => {
  it("uses concise nominal endings and separates sentences", () => {
    expect(
      formatHistoryReasonLines(
        "최근 평균 조회수가 기준에 미달해 제외되었습니다. 개인 연락처가 확인되지 않아 보류되었습니다.",
      ),
    ).toEqual([
      "최근 평균 조회수가 기준에 미달해 제외됨",
      "개인 연락처가 확인되지 않아 보류됨",
    ]);
  });

  it("converts recommendation and unchecked-evidence endings", () => {
    expect(formatHistoryReasonLines("모든 필수 검증 조건을 충족했습니다. 확인되지 않은 필수 근거가 있습니다.")).toEqual([
      "모든 필수 검증 조건을 충족함",
      "확인되지 않은 필수 근거가 있음",
    ]);
  });
});
