"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CreatorDecision, ManualDecisionReason } from "@/types/domain";

const decisionLabels: Record<CreatorDecision, string> = { recommended: "추천", hold: "보류", excluded: "제외" };
const reasonOptions: Array<{ value: ManualDecisionReason; label: string }> = [
  { value: "marketer_fit", label: "캠페인 적합성 재판단" },
  { value: "contact_verified", label: "연락 가능성 확인" },
  { value: "campaign_mismatch", label: "캠페인 방향 불일치" },
  { value: "insufficient_evidence", label: "근거 추가 확인 필요" },
  { value: "do_not_contact", label: "연락 제외 대상" },
  { value: "duplicate_or_invalid", label: "중복 또는 무효 후보" },
  { value: "other", label: "기타 운영 판단" },
];

export function ManualDecisionControls({
  runId,
  creatorInternalId,
  currentDecision,
  contactReady,
  hardLocked,
}: {
  runId: string;
  creatorInternalId: string;
  currentDecision: CreatorDecision;
  contactReady: boolean;
  hardLocked: boolean;
}): React.ReactNode {
  if (hardLocked) {
    return <span className="text-xs font-semibold text-rose-700">비협상 제외 잠금</span>;
  }
  return <EditableManualDecisionControls
    runId={runId}
    creatorInternalId={creatorInternalId}
    currentDecision={currentDecision}
    contactReady={contactReady}
  />;
}

function EditableManualDecisionControls({
  runId,
  creatorInternalId,
  currentDecision,
  contactReady,
}: {
  runId: string;
  creatorInternalId: string;
  currentDecision: CreatorDecision;
  contactReady: boolean;
}): React.ReactNode {
  const router = useRouter();
  const firstDecision = (["recommended", "hold", "excluded"] as const)
    .find((value) => value !== currentDecision && (value !== "recommended" || contactReady)) ?? currentDecision;
  const [decision, setDecision] = useState<CreatorDecision>(firstDecision);
  const [reason, setReason] = useState<ManualDecisionReason>(currentDecision === "recommended" ? "campaign_mismatch" : "marketer_fit");
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  const save = async (): Promise<void> => {
    setPending(true);
    setMessage("");
    try {
      const response = await fetch(`/api/runs/${encodeURIComponent(runId)}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ creatorInternalId, decision, reason, note }),
      });
      const payload = await response.json() as { message?: string };
      if (!response.ok) throw new Error(payload.message ?? "판정을 저장하지 못했습니다.");
      setMessage(`${decisionLabels[decision]} 판정과 사유를 저장했습니다.`);
      router.refresh();
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : "판정을 저장하지 못했습니다.");
    } finally {
      setPending(false);
    }
  };

  return <details className="min-w-52">
    <summary className="focus-ring cursor-pointer rounded text-xs font-semibold text-brand">판정 수정</summary>
    <div className="mt-2 space-y-2 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <select className="input py-1.5 text-xs" aria-label="새 판정" value={decision} onChange={(event) => setDecision(event.target.value as CreatorDecision)}>
        {(["recommended", "hold", "excluded"] as const).map((value) => <option
          key={value}
          value={value}
          disabled={value === currentDecision || (value === "recommended" && !contactReady)}
        >{decisionLabels[value]}{value === "recommended" && !contactReady ? " (개인 연락처 필요)" : ""}</option>)}
      </select>
      <select className="input py-1.5 text-xs" aria-label="수정 이유" value={reason} onChange={(event) => setReason(event.target.value as ManualDecisionReason)}>
        {reasonOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      <input className="input py-1.5 text-xs" maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} placeholder="메모(선택)" />
      <button type="button" className="button-secondary w-full justify-center py-1.5 text-xs" disabled={pending || decision === currentDecision} onClick={() => void save()}>{pending ? "저장 중…" : "수정 저장"}</button>
      {message && <p role="status" className="text-xs text-slate-600">{message}</p>}
    </div>
  </details>;
}
