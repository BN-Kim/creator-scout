const nominalEndings: ReadonlyArray<readonly [RegExp, string]> = [
  [/하지 않았습니다$/, "하지 않음"],
  [/않았습니다$/, "않음"],
  [/되었습니다$/, "됨"],
  [/했습니다$/, "함"],
  [/필요합니다$/, "필요함"],
  [/있습니다$/, "있음"],
  [/없습니다$/, "없음"],
  [/입니다$/, "임"],
  [/됩니다$/, "됨"],
  [/합니다$/, "함"],
];

function toNominalEnding(sentence: string): string {
  for (const [pattern, replacement] of nominalEndings) {
    if (pattern.test(sentence)) return sentence.replace(pattern, replacement);
  }
  return sentence;
}

export function formatHistoryReasonLines(explanation: string): string[] {
  return explanation
    .split(/\.\s*/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0)
    .map(toNominalEnding);
}
