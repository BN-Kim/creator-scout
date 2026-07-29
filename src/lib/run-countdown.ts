export function remainingRunTimeMs(startedAtMs: number, nowMs: number, limitMs: number): number {
  return Math.max(0, limitMs - Math.max(0, nowMs - startedAtMs));
}

export function formatRunCountdown(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.ceil(durationMs / 1_000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

