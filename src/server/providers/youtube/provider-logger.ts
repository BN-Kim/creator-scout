import type { YouTubeProviderErrorCategory } from "@/server/providers/youtube/provider-error";

export interface YouTubeProviderLogEvent {
  event: "request_started" | "request_succeeded" | "request_failed" | "retry_scheduled";
  operation: string;
  attempt: number;
  status?: number;
  category?: YouTubeProviderErrorCategory;
}

export interface YouTubeProviderLogger {
  log(event: YouTubeProviderLogEvent): void;
}

export const consoleYouTubeProviderLogger: YouTubeProviderLogger = {
  log(event): void {
    console.info("youtube_provider", event);
  },
};
