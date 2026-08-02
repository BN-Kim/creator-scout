import { openDatabase } from "@/server/database/database";
import { SqliteDecisionAuditRepository } from "@/server/history/sqlite-decision-audit-repository";
import { SqliteMarketingOutcomeRepository } from "@/server/marketing/sqlite-marketing-outcome-repository";
import type { AutomaticScoutingDecisionBreakdown } from "@/server/scouting/automatic-scouting-types";
import type { AutomaticScoutingRunResult } from "@/server/scouting/automatic-scouting-types";
import { SqliteAutomaticRunResultRepository } from "@/server/scouting/sqlite-automatic-run-result-repository";
import type { MarketingOutcomeEvent, MarketingOutcomeType } from "@/types/domain";

export interface MarketingDiagnosticsReport {
  generatedAt: string;
  runCount: number;
  discoveryRunCount: number;
  reevaluationRunCount: number;
  manualDecisionCount: number;
  overall: AutomaticScoutingDecisionBreakdown;
  byRuleVersion: Record<string, AutomaticScoutingDecisionBreakdown>;
  byCategory: Record<string, AutomaticScoutingDecisionBreakdown>;
  byQuery: Record<string, AutomaticScoutingDecisionBreakdown>;
  outcomeFunnel: Record<MarketingOutcomeType, { events: number; creators: number }>;
  campaignTotals: {
    views: number;
    likes: number;
    comments: number;
    conversions: number;
    revenueKrw: number;
  };
}

export function createMarketingDiagnosticsReport(): MarketingDiagnosticsReport {
  const database = openDatabase();
  try {
    const runs = new SqliteAutomaticRunResultRepository(database).list(500);
    const outcomes = new SqliteMarketingOutcomeRepository(database).list();
    return buildMarketingDiagnosticsReport(
      runs,
      outcomes,
      new SqliteDecisionAuditRepository(database).list().length,
    );
  } finally {
    database.close();
  }
}

export function buildMarketingDiagnosticsReport(
  runs: readonly AutomaticScoutingRunResult[],
  outcomes: readonly MarketingOutcomeEvent[],
  manualDecisionCount: number,
  generatedAt = new Date().toISOString(),
): MarketingDiagnosticsReport {
    const report: MarketingDiagnosticsReport = {
      generatedAt,
      runCount: runs.length,
      discoveryRunCount: runs.filter((run) => run.runKind === "discovery").length,
      reevaluationRunCount: runs.filter((run) => run.runKind === "reevaluation").length,
      manualDecisionCount,
      overall: emptyBreakdown(),
      byRuleVersion: {},
      byCategory: {},
      byQuery: {},
      outcomeFunnel: Object.fromEntries(outcomeTypes.map((type) => [type, { events: 0, creators: 0 }])) as MarketingDiagnosticsReport["outcomeFunnel"],
      campaignTotals: { views: 0, likes: 0, comments: 0, conversions: 0, revenueKrw: 0 },
    };
    for (const run of runs) {
      addBreakdown(report.overall, run.diagnostics.funnel);
      const version = run.requestSnapshot?.ruleVersion ?? run.results[0]?.ruleVersion ?? "legacy";
      report.byRuleVersion[version] ??= emptyBreakdown();
      addBreakdown(report.byRuleVersion[version], run.diagnostics.funnel);
      for (const [category, breakdown] of Object.entries(run.diagnostics.byCategory)) {
        report.byCategory[category] ??= emptyBreakdown();
        addBreakdown(report.byCategory[category], breakdown);
      }
      for (const [query, breakdown] of Object.entries(run.diagnostics.byQuery)) {
        report.byQuery[query] ??= emptyBreakdown();
        addBreakdown(report.byQuery[query], breakdown);
      }
    }
    for (const type of outcomeTypes) {
      const matching = outcomes.filter((event) => event.outcomeType === type);
      report.outcomeFunnel[type] = {
        events: matching.length,
        creators: new Set(matching.map((event) => event.historyRecordId)).size,
      };
    }
    for (const outcome of outcomes) {
      report.campaignTotals.views += outcome.views ?? 0;
      report.campaignTotals.likes += outcome.likes ?? 0;
      report.campaignTotals.comments += outcome.comments ?? 0;
      report.campaignTotals.conversions += outcome.conversions ?? 0;
      report.campaignTotals.revenueKrw += outcome.revenueKrw ?? 0;
    }
    return report;
}

export const outcomeTypes: MarketingOutcomeType[] = [
  "marketer_approved",
  "contact_attempted",
  "replied",
  "meeting",
  "contracted",
  "content_published",
  "campaign_performance",
];

function emptyBreakdown(): AutomaticScoutingDecisionBreakdown {
  return { evaluated: 0, staticEligible: 0, scoreQualified: 0, contactReady: 0, recommended: 0, hold: 0, excluded: 0 };
}

function addBreakdown(target: AutomaticScoutingDecisionBreakdown, source: AutomaticScoutingDecisionBreakdown): void {
  for (const key of Object.keys(target) as Array<keyof AutomaticScoutingDecisionBreakdown>) target[key] += source[key];
}
