import { describe, expect, it } from "vitest";
import { automaticScoutingRunLimitMs } from "@/config/automatic-scouting";
import { formatRunCountdown, remainingRunTimeMs } from "@/lib/run-countdown";
import {
  defaultAutomaticScoutingSafetyLimits,
  loadAutomaticScoutingSafetyLimits,
} from "@/server/scouting/automatic-scouting-config";

describe("automatic scouting time limit", () => {
  it("uses ten minutes as the server and UI maximum", () => {
    expect(automaticScoutingRunLimitMs).toBe(600_000);
    expect(defaultAutomaticScoutingSafetyLimits.maxRunDurationMs).toBe(automaticScoutingRunLimitMs);
    expect(loadAutomaticScoutingSafetyLimits({}).maxRunDurationMs).toBe(automaticScoutingRunLimitMs);
    expect(() => loadAutomaticScoutingSafetyLimits({ SCOUTING_MAX_RUN_DURATION_MS: "600001" })).toThrow(
      "자동 스카우팅 안전 한도 설정이 허용 범위를 벗어났습니다.",
    );
  });

  it("formats a live countdown and never displays negative time", () => {
    expect(formatRunCountdown(remainingRunTimeMs(1_000, 1_000, automaticScoutingRunLimitMs))).toBe("10:00");
    expect(formatRunCountdown(remainingRunTimeMs(1_000, 2_001, automaticScoutingRunLimitMs))).toBe("09:59");
    expect(formatRunCountdown(remainingRunTimeMs(1_000, 700_000, automaticScoutingRunLimitMs))).toBe("00:00");
  });
});

