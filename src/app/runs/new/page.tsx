"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { RunCountdown } from "@/components/run-countdown";
import { creatorCategories } from "@/config/labels";
import { defaultRecommendationSettings, maximumDaysSinceLatestUploadRange } from "@/config/recommendation-rules";
import { notifyOperationsChanged } from "@/lib/operations-refresh";
import { loadRecommendationSettings } from "@/lib/recommendation-settings-storage";
import { validateNewRun, type ValidationErrors } from "@/lib/validation";
import type { NewRunInput } from "@/types/domain";

const initialValues: NewRunInput = {
  name: "", discoveryMode: "automatic", category: "", keywords: "", targetRecommendedCount: 5,
  maximumDaysSinceLatestUpload: defaultRecommendationSettings.maximumDaysSinceLatestUpload,
  preferredRecentUploadDays: defaultRecommendationSettings.preferredRecentUploadDays,
  minimumRecentAverageViews: defaultRecommendationSettings.minimumRecentAverageViews,
  minimumRecentMedianViews: defaultRecommendationSettings.minimumRecentMedianViews,
  minimumEfficientCreatorMedianViews: defaultRecommendationSettings.minimumEfficientCreatorMedianViews,
  minimumViewSubscriberRatio: defaultRecommendationSettings.minimumViewSubscriberRatio,
  minimumRecentVideoCount: defaultRecommendationSettings.minimumRecentVideoCount,
  preferredRecentVideoCount: defaultRecommendationSettings.preferredRecentVideoCount,
  minimumSubscriberCount: defaultRecommendationSettings.minimumSubscriberCount,
  maximumSubscriberCount: defaultRecommendationSettings.maximumSubscriberCount,
  recommendationScoreThreshold: defaultRecommendationSettings.recommendationScoreThreshold,
  holdScoreThreshold: defaultRecommendationSettings.holdScoreThreshold,
  viralRiskPenalty: defaultRecommendationSettings.viralRiskPenalty,
  dynamicExclusionTtlDays: defaultRecommendationSettings.dynamicExclusionTtlDays,
  holdRecheckDays: defaultRecommendationSettings.holdRecheckDays,
  scoreWeights: defaultRecommendationSettings.scoreWeights,
  allowedCategories: defaultRecommendationSettings.allowedCategories,
};

export default function NewRunPage(): React.ReactNode {
  const router = useRouter();
  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [runStartedAtMs, setRunStartedAtMs] = useState<number | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const setField = <K extends keyof NewRunInput>(key: K, value: NewRunInput[K]): void => setValues((current) => ({ ...current, [key]: value }));

  useEffect(() => {
    try {
      const settings = loadRecommendationSettings(window.localStorage);
      setValues((current) => ({
        ...current,
        maximumDaysSinceLatestUpload: settings.maximumDaysSinceLatestUpload,
        preferredRecentUploadDays: settings.preferredRecentUploadDays,
        minimumRecentAverageViews: settings.minimumRecentAverageViews,
        minimumRecentMedianViews: settings.minimumRecentMedianViews,
        minimumEfficientCreatorMedianViews: settings.minimumEfficientCreatorMedianViews,
        minimumViewSubscriberRatio: settings.minimumViewSubscriberRatio,
        minimumRecentVideoCount: settings.minimumRecentVideoCount,
        preferredRecentVideoCount: settings.preferredRecentVideoCount,
        minimumSubscriberCount: settings.minimumSubscriberCount,
        maximumSubscriberCount: settings.maximumSubscriberCount,
        recommendationScoreThreshold: settings.recommendationScoreThreshold,
        holdScoreThreshold: settings.holdScoreThreshold,
        viralRiskPenalty: settings.viralRiskPenalty,
        dynamicExclusionTtlDays: settings.dynamicExclusionTtlDays,
        holdRecheckDays: settings.holdRecheckDays,
        scoreWeights: { ...settings.scoreWeights },
        allowedCategories: settings.allowedCategories,
        category: settings.allowedCategories.includes(current.category) ? current.category : "",
      }));
    } catch (error: unknown) {
      console.error("저장된 설정을 스카우트 실행에 적용하지 못했습니다.", error);
      setSettingsError("저장된 설정이 유효하지 않아 기본 기준을 사용합니다.");
    }
  }, []);

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
      const body = await response.json() as { runId?: string; executionId?: string; background?: boolean; message?: string };
      if (!response.ok || !body.runId) throw new Error(body.message ?? "추천 실행을 시작하지 못했습니다.");
      notifyOperationsChanged();
      const executionQuery = body.background && body.executionId
        ? `?executionId=${encodeURIComponent(body.executionId)}`
        : "";
      router.push(`/runs/${body.runId}${executionQuery}`);
    } catch (error: unknown) {
      setSubmitError(error instanceof Error ? error.message : "추천 실행을 시작하지 못했습니다.");
      setSubmitting(false);
      setRunStartedAtMs(null);
    }
  };

  return <>
    <PageHeader title="스카우트 실행" />
    <form onSubmit={submit} noValidate className="panel max-w-4xl p-5 sm:p-8">
      {submitError && <p role="alert" className="mb-6 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{submitError}</p>}
      {settingsError && <p role="alert" className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{settingsError}</p>}
      <div className="mb-6"><RunCountdown startedAtMs={runStartedAtMs} /></div>
      <Field label="스카우팅 목표" error={errors.targetRecommendedCount} hint="(명)" wide>
        <NumberInput value={values.targetRecommendedCount} onChange={(value) => setField("targetRecommendedCount", value)} min={1} max={500} />
      </Field>
      {values.targetRecommendedCount >= 20 && <p className="-mt-3 mb-6 rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-700">20명 이상 목표는 백그라운드에서 실행되며 진행 화면에서 상태를 자동 확인합니다.</p>}
      <details className="mt-7 rounded-xl border border-slate-200 p-4">
        <summary className="focus-ring cursor-pointer rounded text-sm font-semibold text-slate-700">검색 설정(선택)</summary>
        <div className="mt-5 grid gap-6 sm:grid-cols-2">
          <Field label="검색 모드" error={errors.discoveryMode}>
            <select className="input" value={values.discoveryMode ?? "automatic"} onChange={(event) => setField("discoveryMode", event.target.value as NonNullable<NewRunInput["discoveryMode"]>)}>
              <option value="automatic">자동 검색어만</option>
              <option value="manual_extend">자동 검색어 + 추가 검색어</option>
              <option value="manual_replace">추가 검색어만</option>
            </select>
          </Field>
          <Field label="카테고리" error={errors.category}>
            <select className="input" value={values.category} onChange={(event) => setField("category", event.target.value)}>
              <option value="">전체</option>
              {(values.allowedCategories ?? creatorCategories).map((category) => <option key={category}>{category}</option>)}
            </select>
          </Field>
          <Field label="추가 검색어" error={errors.keywords} hint="쉼표 또는 줄바꿈으로 구분" wide>
            <textarea className="input min-h-24" value={values.keywords} onChange={(event) => setField("keywords", event.target.value)} placeholder="자동 모드에서는 비워 두세요" />
          </Field>
          <Field label="스카우트 제목" error={errors.name} hint="선택">
            <input className="input" value={values.name} onChange={(event) => setField("name", event.target.value)} placeholder="비워 두면 자동 생성" />
          </Field>
          <Field label="최근 업로드 기준" error={errors.maximumDaysSinceLatestUpload} hint="7~90일">
            <NumberInput value={values.maximumDaysSinceLatestUpload} onChange={(value) => setField("maximumDaysSinceLatestUpload", value)} min={maximumDaysSinceLatestUploadRange.minimum} max={maximumDaysSinceLatestUploadRange.maximum} />
          </Field>
          <Field label="최소 평균 조회수" error={errors.minimumRecentAverageViews} hint="조회수">
            <NumberInput value={values.minimumRecentAverageViews} onChange={(value) => setField("minimumRecentAverageViews", value)} min={0} />
          </Field>
          <Field label="최소 중앙 조회수" error={errors.minimumRecentMedianViews} hint="조회수">
            <NumberInput value={values.minimumRecentMedianViews} onChange={(value) => setField("minimumRecentMedianViews", value)} min={0} />
          </Field>
          <Field label="최소 업로드 수" error={errors.minimumRecentVideoCount} hint="영상 개수">
            <NumberInput value={values.minimumRecentVideoCount} onChange={(value) => setValues((current) => ({
              ...current,
              minimumRecentVideoCount: value,
              preferredRecentVideoCount: Math.max(defaultRecommendationSettings.preferredRecentVideoCount, value),
            }))} min={1} />
          </Field>
          <Field label="최소 구독자 수" error={errors.minimumSubscriberCount} hint="명">
            <NumberInput value={values.minimumSubscriberCount} onChange={(value) => setField("minimumSubscriberCount", value)} min={0} />
          </Field>
          <Field label="최대 구독자 수" error={errors.maximumSubscriberCount} hint="명">
            <NumberInput value={values.maximumSubscriberCount} onChange={(value) => setField("maximumSubscriberCount", value)} min={1} />
          </Field>
        </div>
      </details>
      <div className="mt-8 flex flex-col gap-4 border-t border-slate-200 pt-6 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-slate-500">중복·보류·제외·실패는 스카우팅 목표에 포함되지 않습니다.</p>
        <button className="button-primary" type="submit" disabled={submitting}>{submitting ? "처리 중…" : "스카우트 시작"}</button>
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
