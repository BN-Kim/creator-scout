export type UrlKind = "channel" | "handle" | "video" | "search" | "other";

export function classifyYoutubeUrl(value: string): UrlKind {
  try {
    const url = new URL(value);
    if (!/(^|\.)youtube\.com$/.test(url.hostname)) return "other";
    if (url.pathname === "/results" || url.searchParams.has("search_query")) return "search";
    if (url.pathname === "/watch" || url.pathname.startsWith("/shorts/")) return "video";
    if (url.pathname.startsWith("/channel/")) return "channel";
    if (url.pathname.startsWith("/@")) return "handle";
    return "other";
  } catch { return "other"; }
}

export function normalizeUrl(value: string): string {
  try { const url = new URL(value); return `${url.origin}${url.pathname}`.replace(/\/$/, "").toLowerCase(); } catch { return value.trim().toLowerCase(); }
}
