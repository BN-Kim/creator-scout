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

  it("groups upload activity reasons under one fixed label", () => {
    expect(
      formatHistoryReasonLines(
        "기존 설명",
        ["latest_upload_too_old", "insufficient_recent_video_count"],
        "excluded",
      ),
    ).toEqual(["최소 업로드 미달"]);
  });

  it("uses fixed labels for views and category exclusions", () => {
    expect(
      formatHistoryReasonLines(
        "기존 설명",
        ["recent_views_below_threshold", "category_mismatch"],
        "excluded",
      ),
    ).toEqual(["평균 조회수 미달", "카테고리 불일치"]);
  });

  it("does not mix hold reasons into an excluded history result", () => {
    expect(
      formatHistoryReasonLines(
        "기존 설명",
        ["recent_views_below_threshold", "missing_email"],
        "excluded",
      ),
    ).toEqual(["평균 조회수 미달"]);
  });

  it("uses fixed labels for recommended and held results", () => {
    expect(formatHistoryReasonLines("기존 설명", [], "recommended")).toEqual(["추천 기준 충족"]);
    expect(formatHistoryReasonLines("기존 설명", ["missing_email"], "hold")).toEqual(["개인 연락처 미확인"]);
  });
});
