import { describe, expect, it } from "vitest";
import { formatDateTime, isKoreanCalendarDate } from "@/lib/format";

describe("Korean time formatting", () => {
  it("always displays UTC timestamps in Asia/Seoul time", () => {
    expect(formatDateTime("2026-07-29T15:30:45.000Z")).toContain("2026년 7월 30일");
    expect(formatDateTime("2026-07-29T15:30:45.000Z")).toContain("00:30:45");
  });

  it("calculates dashboard today boundaries in Korean calendar time", () => {
    const reference = new Date("2026-07-29T15:10:00.000Z");
    expect(isKoreanCalendarDate("2026-07-29T15:00:00.000Z", reference)).toBe(true);
    expect(isKoreanCalendarDate("2026-07-29T14:59:59.000Z", reference)).toBe(false);
  });
});
