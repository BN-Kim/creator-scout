import { loadYouTubeProviderConfig } from "@/server/providers/youtube/provider-config";
import { YouTubeDataApiProvider } from "@/server/providers/youtube/youtube-data-api-provider";
import type { YouTubeApiClientDependencies } from "@/server/providers/youtube/youtube-api-client";

export function createYouTubeDataApiProvider(
  environment: NodeJS.ProcessEnv = process.env,
  dependencies: YouTubeApiClientDependencies = {},
): YouTubeDataApiProvider {
  return new YouTubeDataApiProvider(loadYouTubeProviderConfig(environment), dependencies);
}
