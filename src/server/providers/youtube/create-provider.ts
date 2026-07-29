import { loadYouTubeProviderConfig } from "@/server/providers/youtube/provider-config";
import type {
  YouTubeCandidateDiscoveryProvider,
  YouTubeEvidenceProvider,
  YouTubeIdentityProvider,
} from "@/server/providers/youtube/provider-contracts";
import { YouTubeDataApiProvider } from "@/server/providers/youtube/youtube-data-api-provider";
import type { YouTubeApiClientDependencies } from "@/server/providers/youtube/youtube-api-client";

export function createYouTubeDataApiProvider(
  environment: NodeJS.ProcessEnv = process.env,
  dependencies: YouTubeApiClientDependencies = {},
): YouTubeDataApiProvider {
  return new YouTubeDataApiProvider(loadYouTubeProviderConfig(environment), dependencies);
}

export type ConfiguredYouTubeProvider = YouTubeCandidateDiscoveryProvider & YouTubeIdentityProvider & YouTubeEvidenceProvider;

export interface ConfiguredYouTubeProviderDependencies {
  official?: YouTubeApiClientDependencies;
}

export function createConfiguredYouTubeProvider(
  environment: NodeJS.ProcessEnv = process.env,
  dependencies: ConfiguredYouTubeProviderDependencies = {},
): ConfiguredYouTubeProvider {
  return createYouTubeDataApiProvider(environment, dependencies.official);
}
