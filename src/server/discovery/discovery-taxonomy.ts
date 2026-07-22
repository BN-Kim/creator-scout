import { z } from "zod";
import type { DiscoveryQueryDefinition, DiscoveryScope } from "@/server/discovery/discovery-types";

const scopeSchema = z.enum(["narrow", "medium", "broad"]);
const taxonomySchema = z.object({
  categories: z.array(z.object({
    name: z.string().min(1),
    terms: z.array(z.string().min(1)).min(1),
  })).min(2),
  formats: z.array(z.string().min(1)).min(1),
  contexts: z.array(z.string().min(1)).min(1),
  negativeTerms: z.array(z.string().min(1)),
  prohibitedTerms: z.array(z.string().min(1)),
  templates: z.record(scopeSchema, z.array(z.string().min(1)).min(1)),
});

export const discoveryTaxonomy = taxonomySchema.parse({
  categories: [
    { name: "뷰티", terms: ["뷰티", "메이크업", "스킨케어"] },
    { name: "패션", terms: ["패션", "코디", "스타일링"] },
    { name: "푸드", terms: ["요리", "레시피", "맛집"] },
    { name: "라이프스타일", terms: ["라이프스타일", "일상", "살림"] },
    { name: "여행", terms: ["국내 여행", "여행 브이로그", "지역 여행"] },
  ],
  formats: ["브이로그", "리뷰", "튜토리얼", "루틴", "추천"],
  contexts: ["한국", "직장인", "주말", "초보", "일상"],
  negativeTerms: ["공식", "기업", "재업로드", "모음집", "뉴스"],
  prohibitedTerms: ["아동", "도박", "불법", "성인", "혐오"],
  templates: {
    narrow: ["{category} {format} {context}", "{categoryTerm} {format} 한국 크리에이터"],
    medium: ["{category} {format}", "{categoryTerm} {context}"],
    broad: ["{category}", "{categoryTerm} 크리에이터"],
  },
});

const identifierPatterns = [/@/, /https?:\/\//i, /www\./i, /\bUC[a-zA-Z0-9_-]{20,}\b/, /\S+@\S+\.\S+/];

export function normalizeDiscoveryQuery(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("ko-KR");
}

export function isSafeDiscoveryQuery(value: string): boolean {
  const normalized = normalizeDiscoveryQuery(value);
  return normalized.length > 0
    && normalized.length <= 120
    && !identifierPatterns.some((pattern) => pattern.test(value))
    && !discoveryTaxonomy.prohibitedTerms.some((term) => normalized.includes(normalizeDiscoveryQuery(term)));
}

export function generateTaxonomyQueries(scopes: readonly DiscoveryScope[] = ["narrow", "medium", "broad"]): DiscoveryQueryDefinition[] {
  const queries: DiscoveryQueryDefinition[] = [];
  const seen = new Set<string>();
  for (const scope of scopes) {
    for (const category of discoveryTaxonomy.categories) {
      for (const template of discoveryTaxonomy.templates[scope] ?? []) {
        const categoryTerm = category.terms[(queries.length + category.name.length) % category.terms.length];
        const format = discoveryTaxonomy.formats[(queries.length + 1) % discoveryTaxonomy.formats.length];
        const context = discoveryTaxonomy.contexts[(queries.length + 2) % discoveryTaxonomy.contexts.length];
        const query = template
          .replace("{category}", category.name)
          .replace("{categoryTerm}", categoryTerm)
          .replace("{format}", format)
          .replace("{context}", context);
        const normalizedKey = normalizeDiscoveryQuery(query);
        if (!seen.has(normalizedKey) && isSafeDiscoveryQuery(query)) {
          seen.add(normalizedKey);
          queries.push({ query, normalizedKey, category: category.name, scope, origin: "taxonomy" });
        }
      }
    }
  }
  return queries;
}

export function createManualQueries(values: readonly string[], fallbackCategory = discoveryTaxonomy.categories[0]?.name ?? "라이프스타일"): DiscoveryQueryDefinition[] {
  const seen = new Set<string>();
  return values.flatMap((value) => {
    const query = value.trim();
    const normalizedKey = normalizeDiscoveryQuery(query);
    if (!isSafeDiscoveryQuery(query) || seen.has(normalizedKey)) return [];
    seen.add(normalizedKey);
    const category = discoveryTaxonomy.categories.find((item) => item.terms.some((term) => normalizedKey.includes(normalizeDiscoveryQuery(term))))?.name ?? fallbackCategory;
    return [{ query, normalizedKey, category, scope: "narrow" as const, origin: "manual" as const }];
  });
}

export function isApprovedCategory(category: string): boolean {
  return discoveryTaxonomy.categories.some((item) => item.name === category);
}
