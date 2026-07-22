import type { AutomaticScoutingRunResult } from "@/server/scouting/automatic-scouting-types";

const globalResults = globalThis as typeof globalThis & {
  automaticScoutingRunResults?: Map<string, AutomaticScoutingRunResult>;
};

function resultStore(): Map<string, AutomaticScoutingRunResult> {
  globalResults.automaticScoutingRunResults ??= new Map();
  return globalResults.automaticScoutingRunResults;
}

export function saveAutomaticRunResult(result: AutomaticScoutingRunResult): void {
  resultStore().set(result.runId, result);
}

export function getAutomaticRunResult(runId: string): AutomaticScoutingRunResult | null {
  return resultStore().get(runId) ?? null;
}
