"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { RunCountdown } from "@/components/run-countdown";
import { creatorCategories } from "@/config/labels";
import { maximumDaysSinceLatestUploadRange } from "@/config/recommendation-rules";
import { notifyOperationsChanged } from "@/lib/operations-refresh";
import { validateNewRun, type ValidationErrors } from "@/lib/validation";
import type { NewRunInput } from "@/types/domain";

const initialValues: NewRunInput = {
  name: "", discoveryMode: "automatic", category: "", keywords: "", targetRecommendedCount: 50,
  maximumDaysSinceLatestUpload: 56, minimumRecentAverageViews: 10000, minimumRecentVideoCount: 2,
};

export default function NewRunPage(): React.ReactNode {
  const router = useRouter();
  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [runStartedAtMs, setRunStartedAtMs] = useState<number | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const setField = <K extends keyof NewRunInput>(key: K, value: NewRunInput[K]): void => setValues((current) => ({ ...current, [key]: value }));

  const submit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (submitting) return;
    const nextErrors = validateNewRun(values);
    setErrors(nextErrors);
    setSubmitError(null);
    if (Object.keys(nextErrors).length > 0) return;
    setSubmitting(true);
    setRunStartedAtMs(Date.now());
    try {
      const response = await fetch("/api/runs/automatic", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values),
      });
      const body = await response.json() as { runId?: string; message?: string };
      if (!response.ok || !body.runId) throw new Error(body.message ?? "추천 실행을 시작하지 못했습니다.");
      notifyOperationsChanged();
      router.push(`/runs/${body.runId}`);
    } catch (error: unknown) {
      setSubmitError(error instanceof Error ? error.message : "추천 실행을 시작하지 못했습니다.");
      setSubmitting(false);
      setRunStartedAtMs(null);
    }
  };

  return <>
    <PageHeader title="새 추천 실행" description="추천 목표만 입력해도 자동으로 다양한 카테고리와 검색 범위를 탐색합니다." />
    <form onSubmit={submit} noValidate className="panel max-w-4xl p-5 sm:p-8">
      {submitError && <p role="alert" className="mb-6 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{submitError}</p>}
      <div className="mb-6"><RunCountdown startedAtMs={runStartedAtMs} /></div>
      <Field label="추천 목표 수" error={errors.targetRecommendedCount} hint="새 추천 완료 인원" wide>
        <NumberInput value={values.targetRecommendedCount} onChange={(value) => setField("targetRecommendedCount", value)} min={1} max={500} />
      </Field>
      <details className="mt-7 rounded-xl border border-slate-200 p-4">
        <summary className="focus-ring cursor-pointer rounded text-sm font-semibold text-slate-700">고급 검색 설정(선택)</summary>
        <div className="mt-5 grid gap-6 sm:grid-cols-2">
          <Field label="발견 모드" error={errors.discoveryMode}>
            <select className="input" value={values.discoveryMode ?? "automatic"} onChange={(event) => setField("discoveryMode", event.target.value as NonNullable<NewRunInput["discoveryMode"]>)}>
              <option value="automatic">자동 검색어만 사용</option>
              <option value="manual_extend">자동 검색어에 직접 입력한 검색어 추가</option>
              <option value="manual_replace">직접 입력한 검색어만 사용</option>
            </select>
          </Field>
          <Field label="우선 카테고리" error={errors.category} hint="선택하지 않으면 전체">
            <select className="input" value={values.category} onChange={(event) => setField("category", event.target.value)}>
              <option value="">전체 승인 카테고리</option>
              {creatorCategories.map((category) => <option key={category}>{category}</option>)}
            </select>
          </Field>
          <Field label="추가 검색어" error={errors.keywords} hint="쉼표 또는 줄바꿈으로 구분" wide>
            <textarea className="input min-h-24" value={values.keywords} onChange={(event) => setField("keywords", event.target.value)} placeholder="자동 모드에서는 비워 두세요" />
          </Field>
          <Field label="실행 이름" error={errors.name} hint="선택">
            <input className="input" value={values.name} onChange={(event) => setField("name", event.target.value)} placeholder="비워 두면 자동 생성" />
          </Field>
          <Field label="최근 업로드 허용 최대 경과일" error={errors.maximumDaysSinceLatestUpload} hint="7~60일">
            <NumberInput value={values.maximumDaysSinceLatestUpload} onChange={(value) => setField("maximumDaysSinceLatestUpload", value)} min={maximumDaysSinceLatestUploadRange.minimum} max={maximumDaysSinceLatestUploadRange.maximum} />
          </Field>
          <Field label="최소 최근 평균 조회수" error={errors.minimumRecentAverageViews} hint="조회수">
            <NumberInput value={values.minimumRecentAverageViews} onChange={(value) => setField("minimumRecentAverageViews", value)} min={0} />
          </Field>
          <Field label="최소 최근 영상 수" error={errors.minimumRecentVideoCount} hint="영상 개수">
            <NumberInput value={values.minimumRecentVideoCount} onChange={(value) => setField("minimumRecentVideoCount", value)} min={2} />
          </Field>
        </div>
      </details>
      <div className="mt-8 flex flex-col gap-4 border-t border-slate-200 pt-6 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-slate-500">중복·보류·제외·실패는 추천 목표에 포함되지 않습니다.</p>
        <button className="button-primary" type="submit" disabled={submitting}>{submitting ? "처리 중…" : "추천 실행 시작"}</button>
      </div>
    </form>
  </>;
}

function Field({ label, error, hint, wide, children }: { label: string; error?: string; hint?: string; wide?: boolean; children: React.ReactNode }): React.ReactNode {
  return <label className={wide ? "sm:col-span-2" : ""}><span className="mb-2 flex items-center justify-between gap-3 text-sm font-semibold text-slate-700"><span>{label}</span>{hint && <span className="text-xs font-normal text-slate-400">{hint}</span>}</span>{children}{error && <span className="mt-1.5 block text-xs font-medium text-rose-600">{error}</span>}</label>;
}

function NumberInput({ value, onChange, min, max }: { value: number; onChange: (value: number) => void; min: number; max?: number }): React.ReactNode {
  return <input type="number" className="input" value={value} min={min} max={max} onChange={(event) => onChange(Number(event.target.value))} />;
}
