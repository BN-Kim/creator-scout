export type YouTubeProviderErrorCategory =
  | "configuration"
  | "invalid_input"
  | "not_found"
  | "quota_exceeded"
  | "rate_limited"
  | "unauthorized"
  | "timeout"
  | "temporary"
  | "response_invalid"
  | "evidence_unavailable"
  | "access_restricted"
  | "provider_incompatible";

export interface YouTubeProviderErrorOptions {
  category: YouTubeProviderErrorCategory;
  operation: string;
  retryable: boolean;
  status?: number;
  retryAfterMs?: number;
}

export class YouTubeProviderError extends Error {
  readonly category: YouTubeProviderErrorCategory;
  readonly operation: string;
  readonly retryable: boolean;
  readonly status?: number;
  readonly retryAfterMs?: number;

  constructor(message: string, options: YouTubeProviderErrorOptions) {
    super(message);
    this.name = "YouTubeProviderError";
    this.category = options.category;
    this.operation = options.operation;
    this.retryable = options.retryable;
    this.status = options.status;
    this.retryAfterMs = options.retryAfterMs;
  }

  toJSON(): Record<string, string | number | boolean | undefined> {
    return {
      name: this.name,
      message: this.message,
      category: this.category,
      operation: this.operation,
      retryable: this.retryable,
      status: this.status,
      retryAfterMs: this.retryAfterMs,
    };
  }
}
