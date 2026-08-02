import type { CreatorDecision, EvaluatedCreator } from "@/types/domain";

export type DecisionGroups = Record<CreatorDecision, EvaluatedCreator[]>;
export function groupResults(creators: EvaluatedCreator[]): DecisionGroups {
  const groups: DecisionGroups = { recommended: [], hold: [], excluded: [] };
  for (const creator of creators) groups[creator.decision].push(creator);
  groups.recommended.sort(compareFitScoreDescending);
  groups.hold.sort(compareFitScoreDescending);
  return groups;
}

function compareFitScoreDescending(left: EvaluatedCreator, right: EvaluatedCreator): number {
  return (right.fitScore ?? -1) - (left.fitScore ?? -1);
}
