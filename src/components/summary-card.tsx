import type { ReactNode } from "react";

export function SummaryCard({ label, value, note, tone = "blue" }: { label: string; value: number; note: string; tone?: "blue" | "amber" | "emerald" | "rose" }): ReactNode {
  const styles = { blue: "bg-blue-50 text-blue-700", amber: "bg-amber-50 text-amber-700", emerald: "bg-emerald-50 text-emerald-700", rose: "bg-rose-50 text-rose-700" };
  return <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className={`mb-4 inline-flex rounded-lg px-2.5 py-1 text-xs font-semibold ${styles[tone]}`}>{label}</div><p className="text-3xl font-bold tabular-nums text-ink">{value}</p><p className="mt-2 text-xs text-slate-500">{note}</p></article>;
}
