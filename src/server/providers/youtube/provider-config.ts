import { YouTubeProviderError } from "@/server/providers/youtube/provider-error";

export interface YouTubeProviderConfig {
  apiKey: string;
  baseUrl: string;
  requestTimeoutMs: number;
  maxRetries: number;
  retryBaseDelayMs: number;
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
