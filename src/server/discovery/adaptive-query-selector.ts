import type { DiscoveryStateRepository } from "@/server/discovery/discovery-state-repository";
import { createManualQueries, generateTaxonomyQueries, isSafeDiscoveryQuery, normalizeDiscoveryQuery } from "@/server/discovery/discovery-taxonomy";
import type { DiscoveryMode, DiscoveryQueryDefinition, DiscoveryQueryState, DiscoveryScope } from "@/server/discovery/discovery-types";
import { minimumProvenQuerySample, scoreDiscoveryQuery } from "@/server/discovery/query-quality";

export interface AdaptiveQuerySelectorOptions {
  mode: DiscoveryMode;
  manualQueries: readonly string[];
  preferredCategory?: string;
}

export interface DiscoverySelectionProgress {
  recommendationsFilled: number;
  evaluated: number;
}

export class AdaptiveQuerySelector {
  private readonly attemptedThisRun = new Set<string>();
  private readonly selectedCategoryCounts = new Map<string, number>();
  private lastCategory: string | null = null;
  private selectionCount = 0;
  private readonly continuationQueue = new Map<string, DiscoveryQueryState>();

  constructor(
    private readonly repository: DiscoveryStateRepository,
    private readonly options: AdaptiveQuerySelectorOptions,
    private readonly now: () => Date,
  ) {}

  initialize(): void {
    const now = this.now();
    for (const state of this.repository.listQueries()) {
      if (state.exhausted && state.cooldownUntil && Date.parse(state.cooldownUntil) <= now.getTime()) {
        this.repository.setCooldown(state.normalizedKey, null, false, now.toISOString());
      }
    }
    const automatic = this.options.mode === "manual_replace"
      ? []
      : generateTaxonomyQueries().filter((query) => matchesPreferredCategory(query, this.options.preferredCategory));
    const manual = this.options.mode === "automatic"
      ? []
      : createManualQueries(this.options.manualQueries, this.options.preferredCategory)
        .filter((query) => matchesPreferredCategory(query, this.options.preferredCategory));
    const nowMs = now.getTime();
    const learned = this.options.mode === "manual_replace" ? [] : this.repository.listLearnedTerms()
      .filter((term) => term.state !== "retired"
        && (!this.options.preferredCategory || term.category === this.options.preferredCategory)
        && (term.state !== "cooldown" || !term.cooldownUntil || Date.parse(term.cooldownUntil) <= nowMs)
        && isSafeDiscoveryQuery(term.phrase))
      .map((term): DiscoveryQueryDefinition => ({
        query: term.phrase,
        normalizedKey: normalizeDiscoveryQuery(term.phrase),
        category: term.category,
        scope: "narrow",
        origin: "learned",
      }));
    this.repository.ensureQueries([...automatic, ...manual, ...learned], now.toISOString());
  }

  next(progressInput: number | DiscoverySelectionProgress): DiscoveryQueryState | null {
    const progress = typeof progressInput === "number"
      ? { recommendationsFilled: progressInput, evaluated: 0 }
      : progressInput;
    const nowMs = this.now().getTime();
    const manualKeys = new Set(
      createManualQueries(this.options.manualQueries, this.options.preferredCategory)
        .filter((query) => matchesPreferredCategory(query, this.options.preferredCategory))
        .map((query) => query.normalizedKey),
    );
    const states = this.repository.listQueries().filter((state) =>
      matchesPreferredCategory(state, this.options.preferredCategory)
      && isAllowedForMode(state, this.options.mode, manualKeys)
      && !state.exhausted
      && !this.attemptedThisRun.has(state.normalizedKey)
      && (!state.cooldownUntil || Date.parse(state.cooldownUntil) <= nowMs),
    );
    const normalStates = states.length > 0;
    const availableStates = normalStates
      ? states
      : [...this.continuationQueue.values()].filter((state) =>
          !state.exhausted
          && (!state.cooldownUntil || Date.parse(state.cooldownUntil) <= nowMs));
    if (availableStates.length === 0) return null;
    const availableScopes = scopeOrder(progress, availableStates);
    const scoped = availableStates.filter((state) => availableScopes.includes(state.scope));
    const strategy = this.selectionCount % 3;
    const strategicPool = scoped.filter((state) => strategy === 0
      ? scoreDiscoveryQuery(state).proven
      : strategy === 1
        ? state.candidatesScanned > 0 && state.candidatesScanned < minimumProvenQuerySample
        : state.candidatesScanned === 0);
    const ranked = [...(strategicPool.length > 0 ? strategicPool : scoped)]
      .sort((left, right) => compareQueries(left, right, this.lastCategory, this.selectedCategoryCounts));
    const selected = ranked[0];
    this.selectionCount += 1;
    this.attemptedThisRun.add(selected.normalizedKey);
    if (!normalStates) this.continuationQueue.delete(selected.normalizedKey);
    this.lastCategory = selected.category;
    this.selectedCategoryCounts.set(
      selected.category,
      (this.selectedCategoryCounts.get(selected.category) ?? 0) + 1,
    );
    return selected;
  }

  allowContinuation(state: DiscoveryQueryState): void {
    this.continuationQueue.set(state.normalizedKey, state);
  }
}

function matchesPreferredCategory(
  query: Pick<DiscoveryQueryDefinition, "category">,
  preferredCategory: string | undefined,
): boolean {
  return !preferredCategory || query.category === preferredCategory;
}

function isAllowedForMode(state: DiscoveryQueryState, mode: DiscoveryMode, manualKeys: ReadonlySet<string>): boolean {
  if (mode === "manual_replace") return manualKeys.has(state.normalizedKey);
  if (mode === "manual_extend") return manualKeys.has(state.normalizedKey) || state.origin === "taxonomy" || state.origin === "learned";
  return state.origin === "taxonomy" || state.origin === "learned";
}

function scopeOrder(progress: DiscoverySelectionProgress, states: readonly DiscoveryQueryState[]): DiscoveryScope[] {
  const hasNarrow = states.some((state) => state.scope === "narrow");
  if (hasNarrow && progress.recommendationsFilled === 0 && progress.evaluated < 20) return ["narrow"];
  const hasMedium = states.some((state) => state.scope === "medium");
  if (hasMedium) return ["narrow", "medium"];
  return ["narrow", "medium", "broad"];
}

function compareQueries(
  left: DiscoveryQueryState,
  right: DiscoveryQueryState,
  lastCategory: string | null,
  categoryCounts: ReadonlyMap<string, number>,
): number {
  const leftScore = scoreDiscoveryQuery(left);
  const rightScore = scoreDiscoveryQuery(right);
  const leftCategoryCount = categoryCounts.get(left.category) ?? 0;
  const rightCategoryCount = categoryCounts.get(right.category) ?? 0;
  if (leftCategoryCount !== rightCategoryCount) return leftCategoryCount - rightCategoryCount;
  const leftDiversity = left.category === lastCategory ? 1 : 0;
  const rightDiversity = right.category === lastCategory ? 1 : 0;
  if (leftDiversity !== rightDiversity) return leftDiversity - rightDiversity;
  if (leftScore.proven !== rightScore.proven) return Number(rightScore.proven) - Number(leftScore.proven);
  if (leftScore.proven && leftScore.score !== rightScore.score) return rightScore.score - leftScore.score;
  if (left.candidatesScanned !== right.candidatesScanned) return left.candidatesScanned - right.candidatesScanned;
  if (left.pagesScanned !== right.pagesScanned) return left.pagesScanned - right.pagesScanned;
  return left.normalizedKey.localeCompare(right.normalizedKey, "ko-KR");
}
