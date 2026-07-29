"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Icon } from "@/components/icons";

const navItems = [
  { href: "/", label: "대시보드", icon: "home" as const },
  { href: "/runs/new", label: "새 추천 실행", icon: "plus" as const },
  { href: "/runs", label: "추천 실행 기록", icon: "runs" as const },
  { href: "/history", label: "크리에이터 히스토리", icon: "history" as const },
  { href: "/settings", label: "설정", icon: "settings" as const },
  { href: "/operations", label: "운영 제어", icon: "runs" as const },
];

export function AppNavigation(): React.ReactNode {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  return <>
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-200 bg-white px-4 lg:hidden">
      <Link href="/" className="font-bold text-ink">크리에이터 <span className="text-brand">스카우트</span></Link>
      <button type="button" onClick={() => setOpen(!open)} aria-label={open ? "메뉴 닫기" : "메뉴 열기"} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"><Icon name={open ? "close" : "menu"} /></button>
    </header>
    <aside className={`${open ? "flex" : "hidden"} fixed inset-x-0 top-16 z-20 h-[calc(100vh-4rem)] flex-col border-r border-slate-200 bg-white p-5 lg:fixed lg:inset-y-0 lg:flex lg:h-auto lg:w-64`}>
      <Link href="/" className="mb-8 hidden px-3 text-xl font-bold tracking-tight text-ink lg:block">크리에이터 <span className="text-brand">스카우트</span></Link>
      <p className="mb-3 px-3 text-xs font-semibold uppercase tracking-widest text-slate-400">크리에이터 운영</p>
      <nav className="space-y-1" aria-label="주요 메뉴">
        {navItems.map((item) => {
          const active = isNavItemActive(item.href, pathname);
          return <Link key={item.href} href={item.href} onClick={() => setOpen(false)} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand ${active ? "bg-blue-50 text-brand" : "text-slate-600 hover:bg-slate-50 hover:text-ink"}`}><Icon name={item.icon} className="h-[18px] w-[18px]" />{item.label}</Link>;
        })}
      </nav>
      <div className="mt-auto rounded-xl bg-slate-50 p-4 text-xs leading-5 text-slate-500"><strong className="block text-slate-700">운영 데이터</strong>SQLite 판정 기록과 실제 실행 상태를 표시합니다.</div>
    </aside>
  </>;
}

function isNavItemActive(href: string, pathname: string): boolean {
  if (href === "/") return pathname === "/";
  if (href === "/runs/new") return pathname === href;
  if (href === "/runs") return pathname === "/runs" || (pathname.startsWith("/runs/") && pathname !== "/runs/new");
  return pathname.startsWith(href);
}
