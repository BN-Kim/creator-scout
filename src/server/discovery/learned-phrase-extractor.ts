import { discoveryTaxonomy, isSafeDiscoveryQuery, normalizeDiscoveryQuery } from "@/server/discovery/discovery-taxonomy";

const blockedTokens = new Set(["공식", "채널", "유튜브", "구독", "좋아요", ...discoveryTaxonomy.prohibitedTerms]);

export function extractSafeDiscoveryPhrases(texts: readonly string[], channelName: string): string[] {
  const blockedNameTokens = new Set(normalizeDiscoveryQuery(channelName).split(" ").filter(Boolean));
  const approvedAnchors = [...discoveryTaxonomy.categories.flatMap((category) => category.terms), ...discoveryTaxonomy.formats, ...discoveryTaxonomy.contexts]
    .map(normalizeDiscoveryQuery);
  const phrases = new Set<string>();
  for (const text of texts) {
    const sanitized = text.replace(/https?:\/\/\S+|\S+@\S+\.\S+|@[\w.-]+/gi, " ").normalize("NFKC");
    const tokens = sanitized.split(/[^가-힣A-Za-z0-9]+/).map((token) => token.trim()).filter((token) => token.length >= 2);
    for (let size = 2; size <= 3; size += 1) {
      for (let index = 0; index + size <= tokens.length; index += 1) {
        const slice = tokens.slice(index, index + size);
        const normalizedTokens = slice.map(normalizeDiscoveryQuery);
        const phrase = slice.join(" ");
        if (normalizedTokens.some((token) => blockedTokens.has(token) || blockedNameTokens.has(token))) continue;
        if (!approvedAnchors.some((anchor) => normalizeDiscoveryQuery(phrase).includes(anchor))) continue;
        if (isSafeDiscoveryQuery(phrase)) phrases.add(phrase);
      }
    }
  }
  return [...phrases].sort((left, right) => left.localeCompare(right, "ko-KR")).slice(0, 10);
}
