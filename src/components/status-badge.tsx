import { decisionLabels, historyStatusLabels, runStatusLabels } from "@/config/labels";
import type { CreatorDecision, HistoryStatus, RunStatus } from "@/types/domain";

type Status = CreatorDecision | HistoryStatus | RunStatus;
export function getStatusLabel(status: Status): string {
  if (status === "hold") return decisionLabels.hold;
  if (status in historyStatusLabels) return historyStatusLabels[status as HistoryStatus];
  return runStatusLabels[status as RunStatus];
}
export function StatusBadge({ status }: { status: Status }): React.ReactNode {
  const styles: Record<Status, string> = { recommended: "bg-emerald-100 text-emerald-700", hold: "bg-amber-100 text-amber-700", excluded: "bg-rose-100 text-rose-700", candidate: "bg-amber-100 text-amber-700", running: "bg-blue-100 text-blue-700", reviewing: "bg-amber-100 text-amber-700", completed: "bg-slate-100 text-slate-700" };
  return <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${styles[status]}`}>{getStatusLabel(status)}</span>;
}
