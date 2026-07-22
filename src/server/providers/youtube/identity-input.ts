import { YouTubeProviderError } from "@/server/providers/youtube/provider-error";
import type { YouTubeIdentityInput } from "@/server/providers/youtube/provider-types";

const channelIdPattern = /^UC[A-Za-z0-9_-]{22}$/;

export type ParsedYouTubeIdentityLookup =
  | { filter: "id"; value: string; resolvedFrom: "channel_id" | "channel_url" }
  | { filter: "forHandle"; value: string; resolvedFrom: "handle" | "handle_url" }
  | { filter: "forUsername"; value: string; resolvedFrom: "username_url" };

export function parseYouTubeIdentityInput(input: YouTubeIdentityInput): ParsedYouTubeIdentityLookup {
  const value = input.value.trim();
  if (!value) throw invalidInput();
  if (input.kind === "channel_id") {
    if (!channelIdPattern.test(value)) throw invalidInput();
    return { filter: "id", value, resolvedFrom: "channel_id" };
  }
  if (input.kind === "handle") {
    return { filter: "forHandle", value: normalizeHandle(value), resolvedFrom: "handle" };
  }
  return parseProfileUrl(value);
}

export function isStableYouTubeChannelId(value: string): boolean {
  return channelIdPattern.test(value);
}

function parseProfileUrl(value: string): ParsedYouTubeIdentityLookup {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw invalidInput();
  }
  if (!/(^|\.)youtube\.com$/i.test(url.hostname)) throw invalidInput();
  let parts: string[];
  try {
    parts = url.pathname.split("/").filter(Boolean).map((part) => decodeURIComponent(part));
  } catch {
    throw invalidInput();
  }
  if (parts.length !== 2 && !(parts.length === 1 && parts[0]?.startsWith("@"))) throw invalidInput();
  if (parts[0] === "channel" && parts[1] && channelIdPattern.test(parts[1])) {
    return { filter: "id", value: parts[1], resolvedFrom: "channel_url" };
  }
  if (parts.length === 1 && parts[0]?.startsWith("@")) {
    return { filter: "forHandle", value: normalizeHandle(parts[0]), resolvedFrom: "handle_url" };
  }
  if (parts[0] === "user" && parts[1] && isSafeProfileSegment(parts[1])) {
    return { filter: "forUsername", value: parts[1], resolvedFrom: "username_url" };
  }
  throw invalidInput();
}

function normalizeHandle(value: string): string {
  const withoutPrefix = value.startsWith("@") ? value.slice(1) : value;
  if (!isSafeProfileSegment(withoutPrefix) || [...withoutPrefix].length < 3 || [...withoutPrefix].length > 30) throw invalidInput();
  return `@${withoutPrefix}`;
}

function isSafeProfileSegment(value: string): boolean {
  return value.length > 0 && !/[\s/?#]/u.test(value);
}

function invalidInput(): YouTubeProviderError {
  return new YouTubeProviderError("YouTube identity input is invalid or unsupported.", {
    category: "invalid_input",
    operation: "resolve_identity",
    retryable: false,
  });
}
