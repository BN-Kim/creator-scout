import type { AutomaticScoutingRunResult } from "@/server/scouting/automatic-scouting-types";
import { getServerAutomaticRunResultRepository } from "@/server/scouting/server-automatic-run-result-repository";

export function saveAutomaticRunResult(result: AutomaticScoutingRunResult): void {
  getServerAutomaticRunResultRepository().save(result);
}

export function getAutomaticRunResult(runId: string): AutomaticScoutingRunResult | null {
  return getServerAutomaticRunResultRepository().get(runId);
}
