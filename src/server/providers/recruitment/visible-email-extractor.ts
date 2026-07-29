export interface VisibleEmailMatch {
  email: string;
  index: number;
  length: number;
}

const zeroWidthCharacters = /[\u200B-\u200D\u2060\uFEFF]/gu;
const atMarker = /\s*(?:\[\s*(?:at|골뱅이)\s*\]|\(\s*(?:at|골뱅이)\s*\))\s*/giu;
const dotMarker = /\s*(?:\[\s*dot\s*\]|\(\s*dot\s*\))\s*/giu;
const htmlAtEntity = /(?:&commat;|&#0*64;|&#x0*40;)/giu;
const htmlDotEntity = /(?:&period;|&#0*46;|&#x0*2e;)/giu;
const visibleEmailPattern = /\b([A-Z0-9.!#$%&'*+/=?^_`{|}~-]+)@([A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\s*\.\s*[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+)\b/giu;

export function extractVisibleEmails(value: string): VisibleEmailMatch[] {
  const normalized = normalizeVisibleEmailText(value);
  return [...normalized.matchAll(visibleEmailPattern)].map((match) => {
    const localPart = match[1].toLowerCase();
    const domain = match[2].replace(/\s+/gu, "").toLowerCase();
    const email = `${localPart}@${domain}`;
    return {
      email,
      index: match.index ?? 0,
      length: match[0].length,
    };
  });
}

export function normalizeVisibleEmailText(value: string): string {
  return value
    .normalize("NFKC")
    .replace(zeroWidthCharacters, "")
    .replace(htmlAtEntity, "@")
    .replace(htmlDotEntity, ".")
    .replace(atMarker, "@")
    .replace(dotMarker, ".")
    .replace(/\s*@\s*/gu, "@");
}
