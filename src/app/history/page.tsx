"use client";

import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/icons";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { creatorCategories, historyStatusLabels } from "@/config/labels";
import { createHistoryExport } from "@/lib/creators";
import { formatHistoryDateTimeParts } from "@/lib/format";
import { formatHistoryReasonLines } from "@/lib/history-presentation";
import { HistoryApiClient, migrateBrowserHistory } from "@/lib/history-api-client";
import type { HistoryRecord, HistoryStatus } from "@/types/domain";

type SortKey = "channelName" | "category" | "processedAt";

export default function HistoryPage(): React.ReactNode {
  const [records, setRecords] = useState<HistoryRecord[]>([]); const [query, setQuery] = useState(""); const [status, setStatus] = useState<HistoryStatus | "all">("all"); const [category, setCategory] = useState("all"); const [sort, setSort] = useState<SortKey>("processedAt"); const [ascending, setAscending] = useState(false); const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    const load = async (): Promise<void> => {
      try {
        const client = new HistoryApiClient();
        await migrateBrowserHistory(window.localStorage, client);
        const loaded = await client.load();
        if (active) setRecords(loaded);
      } catch (loadError) {
        console.error("서버 히스토리를 불러오지 못했습니다.", loadError);
        if (active) setError("서버 히스토리를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
      }
    };
    void load();
    return () => { active = false; };
  }, []);
  const results = useMemo(() => records.filter((record) => (!query.trim() || record.identity.channelName.toLocaleLowerCase("ko-KR").includes(query.trim().toLocaleLowerCase("ko-KR"))) && (status === "all" || record.historyStatus === status) && (category === "all" || record.category === category)).sort((a, b) => { const left = sort === "channelName" ? a.identity.channelName : sort === "category" ? a.category : a.updatedAt; const right = sort === "channelName" ? b.identity.channelName : sort === "category" ? b.category : b.updatedAt; const value = left.localeCompare(right, "ko-KR"); return ascending ? value : -value; }), [records, query, status, category, sort, ascending]);
  const download = (): void => { try { const blob = new Blob([JSON.stringify(createHistoryExport(results), null, 2)], { type: "application/json" }); const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = "creator-history.json"; anchor.click(); URL.revokeObjectURL(url); } catch (error) { console.error("히스토리 내보내기에 실패했습니다.", error); window.alert("내보내기에 실패했습니다. 다시 시도해 주세요."); } };
  const changeSort = (key: SortKey): void => { if (sort === key) setAscending((value) => !value); else { setSort(key); setAscending(true); } };
  return <><PageHeader title="크리에이터 히스토리" action={<button type="button" className="button-secondary" onClick={download}><Icon name="download" className="h-4 w-4" />히스토리 내보내기</button>} />{error && <div role="alert" className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>}<div className="panel mb-5 grid gap-3 p-4 md:grid-cols-[1fr_180px_180px]"><label className="relative"><span className="sr-only">채널명 검색</span><Icon name="search" className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><input className="input pl-9" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="채널명 검색" /></label><select aria-label="상태 필터" className="input" value={status} onChange={(e) => setStatus(e.target.value as HistoryStatus | "all")}><option value="all">모든 상태</option>{Object.entries(historyStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><select aria-label="카테고리 필터" className="input" value={category} onChange={(e) => setCategory(e.target.value)}><option value="all">모든 카테고리</option>{creatorCategories.map((item) => <option key={item}>{item}</option>)}</select></div><div className="panel overflow-hidden"><div className="border-b border-slate-200 p-5 text-sm text-slate-500">총 <strong className="text-ink">{results.length}</strong>개 기록</div><div className="overflow-x-auto"><table className="w-full min-w-[960px] text-left text-sm"><thead className="bg-slate-50 text-xs font-semibold text-slate-500"><tr><SortHeader label="채널명" active={sort === "channelName"} ascending={ascending} onClick={() => changeSort("channelName")} /><th className="px-4 py-3">상태</th><SortHeader label="카테고리" active={sort === "category"} ascending={ascending} onClick={() => changeSort("category")} /><SortHeader label="실행 시각(KST)" active={sort === "processedAt"} ascending={ascending} onClick={() => changeSort("processedAt")} /><th className="px-4 py-3">판정 사유</th><th className="px-4 py-3">추천 실행</th></tr></thead><tbody className="divide-y divide-slate-100">{results.map((record) => <HistoryRow key={record.id} record={record} />)}</tbody></table></div></div></>;
}

function SortHeader({ label, active, ascending, onClick }: { label: string; active: boolean; ascending: boolean; onClick: () => void }): React.ReactNode { return <th className="px-4 py-3"><button type="button" onClick={onClick} className="font-semibold hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand">{label} {active ? (ascending ? "↑" : "↓") : "↕"}</button></th>; }

function HistoryRow({ record }: { record: HistoryRecord }): React.ReactNode {
  const executedAt = formatHistoryDateTimeParts(record.updatedAt);
  return <tr className="hover:bg-slate-50"><td className="px-4 py-4"><p className="font-semibold text-ink">{record.identity.channelName}</p>{record.identity.canonicalChannelUrl ? <a href={record.identity.canonicalChannelUrl} target="_blank" rel="noreferrer" className="mt-1 block text-xs text-brand hover:underline">확인된 채널 URL ↗</a> : <span className="text-xs text-slate-400">URL 미확인</span>}</td><td className="px-4 py-4"><StatusBadge status={record.historyStatus} /></td><td className="px-4 py-4 text-slate-600">{record.category}</td><td className="w-32 px-4 py-4 text-slate-500"><time dateTime={record.updatedAt}><span className="block whitespace-nowrap">{executedAt.date}</span><span className="mt-0.5 block whitespace-nowrap">{executedAt.time}</span></time></td><td className="max-w-sm px-4 py-4 text-xs leading-5 text-slate-500"><div className="space-y-1">{formatHistoryReasonLines(record.koreanExplanation, record.reasonCodes, record.finalDecision).map((line, index) => <p key={`${record.id}-reason-${index}`}>{line}</p>)}</div></td><td className="px-4 py-4 font-mono text-xs text-slate-500">{record.scoutingRunId}</td></tr>;
}
