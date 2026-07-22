import "server-only";
import { LiveRecruitmentEvidenceProvider } from "@/server/providers/recruitment/live-recruitment-provider";
import { loadLiveRecruitmentProviderConfig } from "@/server/providers/recruitment/live-provider-config";

export function createLiveRecruitmentEvidenceProvider(
  environment: NodeJS.ProcessEnv = process.env,
): LiveRecruitmentEvidenceProvider {
  return new LiveRecruitmentEvidenceProvider(loadLiveRecruitmentProviderConfig(environment));
}
