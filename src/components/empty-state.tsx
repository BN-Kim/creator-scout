export function EmptyState({ title, description }: { title: string; description: string }): React.ReactNode {
  return <div className="rounded-xl border border-dashed border-slate-300 px-6 py-12 text-center"><p className="font-semibold text-slate-700">{title}</p><p className="mt-1 text-sm text-slate-500">{description}</p></div>;
}
