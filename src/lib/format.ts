export const koreanTimeZone = "Asia/Seoul";

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("ko-KR").format(value);
}

export function formatDate(value: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric", month: "short", day: "numeric", timeZone: koreanTimeZone,
  }).format(new Date(value));
}

export function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
    second: "2-digit", hour12: false, timeZone: koreanTimeZone,
  }).format(new Date(value));
}

export function isKoreanCalendarDate(value: string, reference: Date): boolean {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    year: "numeric", month: "2-digit", day: "2-digit", timeZone: koreanTimeZone,
  });
  return formatter.format(new Date(value)) === formatter.format(reference);
}
