import { YouTubeProviderError } from "@/server/providers/youtube/provider-error";

export interface YouTubeProviderConfig {
  apiKey: string;
  baseUrl: string;
  requestTimeoutMs: number;
  maxRetries: number;
  retryBaseDelayMs: number;
}

export type YouTubeProviderSelection = "innertube" | "official";

export interface InnerTubeProviderConfig {
  requestTimeoutMs: number;
  maxRetries: number;
  retryBaseDelayMs: number;
}

export function loadYouTubeProviderSelection(environment: NodeJS.ProcessEnv = process.env): YouTubeProviderSelection {
  const selected = environment.YOUTUBE_PROVIDER?.trim().toLowerCase() || "innertube";
  if (selected === "innertube" || selected === "official") return selected;
  throw new YouTubeProviderError("YouTube provider selection is invalid.", {
    category: "configuration",
    operation: "configuration",
    retryable: false,
  });
}

export function loadInnerTubeProviderConfig(environment: NodeJS.ProcessEnv = process.env): InnerTubeProviderConfig {
  return {
    requestTimeoutMs: parseInteger(environment.YOUTUBE_REQUEST_TIMEOUT_MS, 10_000, 100, 120_000, "YOUTUBE_REQUEST_TIMEOUT_MS"),
    maxRetries: parseInteger(environment.YOUTUBE_MAX_RETRIES, 2, 0, 5, "YOUTUBE_MAX_RETRIES"),
    retryBaseDelayMs: 250,
  };
}

export function loadYouTubeProviderConfig(environment: NodeJS.ProcessEnv = process.env): YouTubeProviderConfig {
  const apiKey = environment.YOUTUBE_API_KEY?.trim();
  if (!apiKey) {
    throw new YouTubeProviderError("YouTube provider credential is missing.", {
      category: "configuration",
      operation: "configuration",
      retryable: false,
    });
  }
  return {
    apiKey,
    baseUrl: "https://www.googleapis.com/youtube/v3",
    requestTimeoutMs: parseInteger(environment.YOUTUBE_REQUEST_TIMEOUT_MS, 10_000, 100, 120_000, "YOUTUBE_REQUEST_TIMEOUT_MS"),
    maxRetries: parseInteger(environment.YOUTUBE_MAX_RETRIES, 2, 0, 5, "YOUTUBE_MAX_RETRIES"),
    retryBaseDelayMs: 250,
  };
}

function parseInteger(value: string | undefined, fallback: number, minimum: number, maximum: number, name: string): number {
  if (!value?.trim()) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new YouTubeProviderError(`${name} configuration is invalid.`, {
      category: "configuration",
      operation: "configuration",
      retryable: false,
    });
  }
  return parsed;
}
