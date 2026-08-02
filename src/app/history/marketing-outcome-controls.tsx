"use client";

import { useState } from "react";
import type { MarketingOutcomeType } from "@/types/domain";

const outcomeLabels: Record<MarketingOutcomeType, string> = {
  marketer_approved: "마케터 승인",
  contact_attempted: "연락 시도",
  replied: "회신",
  meeting: "미팅",
  contracted: "계약",
  content_published: "콘텐츠 발행",
  campaign_performance: "콘텐츠 성과",
};

export function MarketingOutcomeControls({ historyRecordId }: { historyRecordId: string }): React.ReactNode {
  const [outcomeType, setOutcomeType] = useState<MarketingOutcomeType>("marketer_approved");
  const [note, setNote] = useState("");
  const [contentUrl, setContentUrl] = useState("");
  const [views, setViews] = useState("");
  const [conversions, setConversions] = useState("");
  const [revenueKrw, setRevenueKrw] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  const save = async (): Promise<void> => {
    setPending(true);
    setMessage("");
    try {
      const response = await fetch(`/api/history/${encodeURIComponent(historyRecordId)}/outcomes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          outcomeType,
          occurredAt: new Date().toISOString(),
          note,
          ...(outcomeType === "campaign_performance" ? {
            contentUrl,
            views: numericOrNull(views),
            conversions: numericOrNull(conversions),
            revenueKrw: numericOrNull(revenueKrw),
          } : {}),
        }),
      });
      const payload = await response.json() as { message?: string };
      if (!response.ok) throw new Error(payload.message ?? "성과를 저장하지 못했습니다.");
      setMessage(`${outcomeLabels[outcomeType]} 기록을 저장했습니다.`);
      setNote("");
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : "성과를 저장하지 못했습니다.");
    } finally {
      setPending(false);
    }
  };

  return <details className="min-w-52">
    <summary className="focus-ring cursor-pointer rounded text-xs font-semibold text-brand">성과 기록</summary>
    <div className="mt-2 space-y-2 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <select className="input py-1.5 text-xs" value={outcomeType} onChange={(event) => setOutcomeType(event.target.value as MarketingOutcomeType)}>
        {Object.entries(outcomeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
      {outcomeType === "campaign_performance" && <>
        <input className="input py-1.5 text-xs" value={contentUrl} onChange={(event) => setContentUrl(event.target.value)} placeholder="콘텐츠 URL(선택)" />
        <input className="input py-1.5 text-xs" type="number" min={0} value={views} onChange={(event) => setViews(event.target.value)} placeholder="조회수" />
        <input className="input py-1.5 text-xs" type="number" min={0} value={conversions} onChange={(event) => setConversions(event.target.value)} placeholder="전환 수" />
        <input className="input py-1.5 text-xs" type="number" min={0} value={revenueKrw} onChange={(event) => setRevenueKrw(event.target.value)} placeholder="매출(원)" />
      </>}
      <input className="input py-1.5 text-xs" maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} placeholder="메모(선택)" />
      <button type="button" className="button-secondary w-full justify-center py-1.5 text-xs" disabled={pending} onClick={() => void save()}>{pending ? "저장 중…" : "성과 저장"}</button>
      {message && <p role="status" className="text-xs text-slate-600">{message}</p>}
    </div>
  </details>;
}

function numericOrNull(value: string): number | null {
  return value.trim() ? Number(value) : null;
}
