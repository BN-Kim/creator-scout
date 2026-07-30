import type { ReactNode } from "react";

export function PageHeader({ title, description, action }: { title: string; description?: string; action?: ReactNode }): ReactNode {
  return <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">{title}</h1>{description && <p className="mt-2 text-sm text-slate-500 sm:text-base">{description}</p>}</div>{action}</div>;
}
