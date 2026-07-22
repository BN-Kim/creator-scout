export interface OperationConfig {
  schedulerEnabled: boolean;
  schedulerPollMs: number;
  minimumRunStartIntervalMs: number;
  leaseDurationMs: number;
  retryBaseDelayMs: number;
  defaultMaxRetries: number;
}

export const defaultOperationConfig: OperationConfig = {
  schedulerEnabled: true,
  schedulerPollMs: 15_000,
  minimumRunStartIntervalMs: 60_000,
  leaseDurationMs: 20 * 60_000,
  retryBaseDelayMs: 30_000,
  defaultMaxRetries: 2,
};

export function loadOperationConfig(environment: Readonly<Record<string, string | undefined>> = process.env): OperationConfig {
  return {
    schedulerEnabled: booleanSetting(environment.OPERATIONS_SCHEDULER_ENABLED, defaultOperationConfig.schedulerEnabled),
    schedulerPollMs: integerSetting(environment.OPERATIONS_SCHEDULER_POLL_MS, defaultOperationConfig.schedulerPollMs, 1_000, 60 * 60_000),
    minimumRunStartIntervalMs: integerSetting(environment.OPERATIONS_MIN_RUN_INTERVAL_MS, defaultOperationConfig.minimumRunStartIntervalMs, 0, 24 * 60 * 60_000),
    leaseDurationMs: integerSetting(environment.OPERATIONS_LEASE_DURATION_MS, defaultOperationConfig.leaseDurationMs, 60_000, 24 * 60 * 60_000),
    retryBaseDelayMs: integerSetting(environment.OPERATIONS_RETRY_BASE_DELAY_MS, defaultOperationConfig.retryBaseDelayMs, 0, 60 * 60_000),
    defaultMaxRetries: integerSetting(environment.OPERATIONS_MAX_RETRIES, defaultOperationConfig.defaultMaxRetries, 0, 10),
  };
}

function booleanSetting(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || !value.trim()) return fallback;
  if (value === "1") return true;
  if (value === "0") return false;
  throw new Error("운영 활성화 설정값은 0 또는 1이어야 합니다.");
}

function integerSetting(value: string | undefined, fallback: number, minimum: number, maximum: number): number {
  if (value === undefined || !value.trim()) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) throw new Error("운영 설정값이 허용 범위를 벗어났습니다.");
  return parsed;
}
