import {
  loadInnerTubeProviderConfig,
  loadYouTubeProviderConfig,
  loadYouTubeProviderSelection,
} from "@/server/providers/youtube/provider-config";
import type {
  YouTubeCandidateDiscoveryProvider,
  YouTubeEvidenceProvider,
  YouTubeIdentityProvider,
} from "@/server/providers/youtube/provider-contracts";
import { InnerTubeYouTubeProvider, type InnerTubeProviderDependencies } from "@/server/providers/youtube/innertube-provider";
import { YouTubeDataApiProvider } from "@/server/providers/youtube/youtube-data-api-provider";
import type { YouTubeApiClientDependencies } from "@/server/providers/youtube/youtube-api-client";

export function createYouTubeDataApiProvider(
  environment: NodeJS.ProcessEnv = process.env,
  dependencies: YouTubeApiClientDependencies = {},
): YouTubeDataApiProvider {
  return new YouTubeDataApiProvider(loadYouTubeProviderConfig(environment), dependencies);
}

export type ConfiguredYouTubeProvider = YouTubeCandidateDiscoveryProvider & YouTubeIdentityProvider & YouTubeEvidenceProvider;

export function createInnerTubeYouTubeProvider(
  environment: NodeJS.ProcessEnv = process.env,
  dependencies: InnerTubeProviderDependencies = {},
): InnerTubeYouTubeProvider {
  return new InnerTubeYouTubeProvider(loadInnerTubeProviderConfig(environment), dependencies);
}

export interface ConfiguredYouTubeProviderDependencies {
  official?: YouTubeApiClientDependencies;
  innertube?: InnerTubeProviderDependencies;
}

export function createConfiguredYouTubeProvider(
  environment: NodeJS.ProcessEnv = process.env,
  dependencies: ConfiguredYouTubeProviderDependencies = {},
): ConfiguredYouTubeProvider {
  const selected = loadYouTubeProviderSelection(environment);
  if (selected === "official") return createYouTubeDataApiProvider(environment, dependencies.official);
  return createInnerTubeYouTubeProvider(environment, dependencies.innertube);
}
