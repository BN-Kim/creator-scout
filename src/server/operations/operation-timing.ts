export function nextScheduledAt(previousNextRunAt: string, intervalMinutes: number, now: Date): string {
  const intervalMs = intervalMinutes * 60_000;
  let next = Date.parse(previousNextRunAt) + intervalMs;
  while (next <= now.getTime()) next += intervalMs;
  return new Date(next).toISOString();
}

export function retryDelayMs(baseDelayMs: number, completedAttempts: number): number {
  return baseDelayMs * 2 ** Math.max(0, completedAttempts - 1);
}

export async function waitForStartRateLimit(
  lastStartedAt: string | null,
  minimumIntervalMs: number,
  now: () => Date,
  sleep: (durationMs: number) => Promise<void>,
): Promise<number> {
  if (!lastStartedAt || minimumIntervalMs === 0) return 0;
  const remaining = Date.parse(lastStartedAt) + minimumIntervalMs - now().getTime();
  if (remaining <= 0) return 0;
  await sleep(remaining);
  return remaining;
}
