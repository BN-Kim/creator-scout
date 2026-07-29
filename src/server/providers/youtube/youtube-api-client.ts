import type { YouTubeProviderConfig } from "@/server/providers/youtube/provider-config";
import { YouTubeProviderError, type YouTubeProviderErrorCategory } from "@/server/providers/youtube/provider-error";
import { consoleYouTubeProviderLogger, type YouTubeProviderLogger } from "@/server/providers/youtube/provider-logger";

export type ProviderFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
export type ProviderSleep = (milliseconds: number) => Promise<void>;

export interface YouTubeApiClientDependencies {
  fetch?: ProviderFetch;
  sleep?: ProviderSleep;
  logger?: YouTubeProviderLogger;
}

export class YouTubeApiClient {
  private readonly fetchImplementation: ProviderFetch;
  private readonly sleep: ProviderSleep;
  private readonly logger: YouTubeProviderLogger;

  constructor(private readonly config: YouTubeProviderConfig, dependencies: YouTubeApiClientDependencies = {}) {
    this.fetchImplementation = dependencies.fetch ?? fetch;
    this.sleep = dependencies.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
    this.logger = dependencies.logger ?? consoleYouTubeProviderLogger;
  }

  async get(operation: string, resource: string, parameters: Readonly<Record<string, string>>): Promise<unknown> {
    const url = new URL(`${this.config.baseUrl}/${resource}`);
    for (const [key, value] of Object.entries(parameters)) url.searchParams.set(key, value);
    url.searchParams.set("key", this.config.apiKey);

    const maximumRetryCount = Math.max(this.config.maxRetries, this.config.maxRateLimitRetries);
    for (let attempt = 0; attempt <= maximumRetryCount; attempt += 1) {
      const displayAttempt = attempt + 1;
      this.logger.log({ event: "request_started", operation, attempt: displayAttempt });
      try {
        const response = await this.fetchWithTimeout(url);
        if (!response.ok) throw await classifyResponseError(response, operation);
        let body: unknown;
        try {
          body = await response.json() as unknown;
        } catch {
          throw new YouTubeProviderError("YouTube provider returned an invalid response.", {
            category: "response_invalid", operation, retryable: false, status: response.status,
          });
        }
        this.logger.log({ event: "request_succeeded", operation, attempt: displayAttempt, status: response.status });
        return body;
      } catch (cause) {
        const error = normalizeRequestError(cause, operation);
        this.logger.log({ event: "request_failed", operation, attempt: displayAttempt, status: error.status, category: error.category });
        const retryLimit = error.category === "rate_limited"
          ? this.config.maxRateLimitRetries
          : this.config.maxRetries;
        if (!error.retryable || attempt >= retryLimit) throw error;
        this.logger.log({ event: "retry_scheduled", operation, attempt: displayAttempt, status: error.status, category: error.category });
        const baseDelay = error.category === "rate_limited"
          ? this.config.rateLimitRetryBaseDelayMs
          : this.config.retryBaseDelayMs;
        await this.sleep(Math.max(baseDelay * (2 ** attempt), error.retryAfterMs ?? 0));
      }
    }
    throw new YouTubeProviderError("YouTube provider request failed.", {
      category: "temporary", operation, retryable: true,
    });
  }

  private async fetchWithTimeout(url: URL): Promise<Response> {
    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_resolve, reject) => {
      timeout = setTimeout(() => {
        controller.abort();
        reject(new YouTubeProviderError("YouTube provider request timed out.", {
          category: "timeout", operation: "request", retryable: true,
        }));
      }, this.config.requestTimeoutMs);
    });
    try {
      return await Promise.race([
        this.fetchImplementation(url, { method: "GET", signal: controller.signal }),
        timeoutPromise,
      ]);
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }
}

async function classifyResponseError(response: Response, operation: string): Promise<YouTubeProviderError> {
  let body: unknown = null;
  try { body = await response.json() as unknown; } catch { body = null; }
  const reason = extractGoogleErrorReason(body);
  const classification = classifyStatus(response.status, reason, operation);
  return new YouTubeProviderError(messageForCategory(classification.category), {
    category: classification.category,
    operation,
    retryable: classification.retryable,
    status: response.status,
    retryAfterMs: retryAfterMilliseconds(response.headers.get("retry-after")),
  });
}

function retryAfterMilliseconds(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1_000, 120_000);
  const dateMs = Date.parse(value);
  if (Number.isNaN(dateMs)) return undefined;
  return Math.min(Math.max(dateMs - Date.now(), 0), 120_000);
}

function extractGoogleErrorReason(value: unknown): string | null {
  if (!isRecord(value) || !isRecord(value.error) || !Array.isArray(value.error.errors)) return null;
  const first = value.error.errors.find((item) => isRecord(item) && typeof item.reason === "string");
  return isRecord(first) && typeof first.reason === "string" ? first.reason : null;
}

function classifyStatus(status: number, reason: string | null, operation: string): { category: YouTubeProviderErrorCategory; retryable: boolean } {
  if (operation === "discover_candidates" && status === 429 && reason === "rateLimitExceeded") {
    return { category: "quota_exceeded", retryable: false };
  }
  if (["quotaExceeded", "dailyLimitExceeded", "dailyLimitExceededUnreg"].includes(reason ?? "")) return { category: "quota_exceeded", retryable: false };
  if (["rateLimitExceeded", "userRateLimitExceeded"].includes(reason ?? "") || status === 429) return { category: "rate_limited", retryable: true };
  if (status === 400) return { category: "invalid_input", retryable: false };
  if (status === 404) return { category: "not_found", retryable: false };
  if (status === 401 || status === 403) return { category: "unauthorized", retryable: false };
  if (status >= 500) return { category: "temporary", retryable: true };
  return { category: "temporary", retryable: false };
}

function normalizeRequestError(cause: unknown, operation: string): YouTubeProviderError {
  if (cause instanceof YouTubeProviderError) {
    if (cause.operation === "request") {
      return new YouTubeProviderError(cause.message, {
        category: cause.category, operation, retryable: cause.retryable, status: cause.status,
        retryAfterMs: cause.retryAfterMs,
      });
    }
    return cause;
  }
  return new YouTubeProviderError("YouTube provider request failed temporarily.", {
    category: "temporary", operation, retryable: true,
  });
}

function messageForCategory(category: YouTubeProviderErrorCategory): string {
  const messages: Record<YouTubeProviderErrorCategory, string> = {
    configuration: "YouTube provider configuration is invalid.",
    invalid_input: "YouTube provider rejected the request input.",
    not_found: "YouTube resource was not found.",
    quota_exceeded: "YouTube provider quota is exhausted.",
    rate_limited: "YouTube provider rate limit was reached.",
    unauthorized: "YouTube provider credential was rejected.",
    timeout: "YouTube provider request timed out.",
    temporary: "YouTube provider is temporarily unavailable.",
    response_invalid: "YouTube provider returned an invalid response.",
    evidence_unavailable: "YouTube video evidence is unavailable.",
    access_restricted: "YouTube provider access is restricted.",
    provider_incompatible: "YouTube provider response is incompatible.",
  };
  return messages[category];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
