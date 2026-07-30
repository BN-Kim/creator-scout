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

export interface HistoryDateTimeParts {
  date: string;
  time: string;
}

export function formatHistoryDateTimeParts(value: string): HistoryDateTimeParts {
  const date = new Date(value);
  const dateParts = new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    timeZone: koreanTimeZone,
  }).formatToParts(date);
  const getPart = (type: Intl.DateTimeFormatPartTypes): string =>
    dateParts.find((part) => part.type === type)?.value ?? "";
  const weekday = getPart("weekday").replace("요일", "");
  const time = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: koreanTimeZone,
  }).format(date);

  return {
    date: `${getPart("year")}.${getPart("month")}.${getPart("day")}.(${weekday})`,
    time,
  };
}

export function formatHistoryDateTime(value: string): string {
  const parts = formatHistoryDateTimeParts(value);
  return `${parts.date} ${parts.time}`;
}

export function isKoreanCalendarDate(value: string, reference: Date): boolean {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    year: "numeric", month: "2-digit", day: "2-digit", timeZone: koreanTimeZone,
  });
  return formatter.format(new Date(value)) === formatter.format(reference);
}
