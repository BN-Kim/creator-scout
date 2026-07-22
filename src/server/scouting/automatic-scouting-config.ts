import type { AutomaticScoutingSafetyLimits } from "@/server/scouting/automatic-scouting-types";

export const defaultAutomaticScoutingSafetyLimits: AutomaticScoutingSafetyLimits = {
  maxScannedCandidates: 2_000,
  maxDiscoveryPages: 100,
  maxRunDurationMs: 15 * 60 * 1_000,
  maxProviderFailures: 100,
};

export function loadAutomaticScoutingSafetyLimits(
  environment: NodeJS.ProcessEnv = process.env,
): AutomaticScoutingSafetyLimits {
  return {
    maxScannedCandidates: integerSetting(
      environment.SCOUTING_MAX_SCANNED_CANDIDATES,
      defaultAutomaticScoutingSafetyLimits.maxScannedCandidates,
      1,
      100_000,
    ),
    maxDiscoveryPages: integerSetting(
      environment.SCOUTING_MAX_DISCOVERY_PAGES,
      defaultAutomaticScoutingSafetyLimits.maxDiscoveryPages,
      1,
      10_000,
    ),
    maxRunDurationMs: integerSetting(
      environment.SCOUTING_MAX_RUN_DURATION_MS,
      defaultAutomaticScoutingSafetyLimits.maxRunDurationMs,
      1,
      24 * 60 * 60 * 1_000,
    ),
    maxProviderFailures: integerSetting(
      environment.SCOUTING_MAX_PROVIDER_FAILURES,
      defaultAutomaticScoutingSafetyLimits.maxProviderFailures,
      1,
      10_000,
    ),
  };
}

function integerSetting(value: string | undefined, fallback: number, minimum: number, maximum: number): number {
  if (value === undefined || !value.trim()) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error("자동 스카우팅 안전 한도 설정이 허용 범위를 벗어났습니다.");
  }
  return parsed;
}
