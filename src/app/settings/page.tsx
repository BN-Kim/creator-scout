"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { creatorCategories } from "@/config/labels";
import { defaultRecommendationSettings, maximumDaysSinceLatestUploadRange } from "@/config/recommendation-rules";
import { loadRecommendationSettings, saveRecommendationSettings } from "@/lib/recommendation-settings-storage";
import type { RecommendationSettings } from "@/types/domain";

type NumericSettingKey =
  | "recommendationScoreThreshold"
  | "holdScoreThreshold"
  | "minimumRecentAverageViews"
  | "minimumRecentMedianViews"
  | "maximumDaysSinceLatestUpload"
  | "minimumRecentVideoCount"
  | "minimumSubscriberCount"
  | "maximumSubscriberCount";

export default function SettingsPage(): React.ReactNode {
  const [settings, setSettings] = useState<RecommendationSettings>(defaultRecommendationSettings);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    try {
      setSettings(loadRecommendationSettings(window.localStorage));
    } catch (caught) {
      console.error("저장된 설정을 불러오지 못했습니다.", caught);
      setError("저장된 설정이 유효하지 않아 기본값을 사용합니다.");
    }
  }, []);

  const setNumber = (key: NumericSettingKey, value: number): void => {
    setSettings((current) => key === "minimumRecentVideoCount"
      ? {
          ...current,
          minimumRecentVideoCount: value,
          preferredRecentVideoCount: Math.max(defaultRecommendationSettings.preferredRecentVideoCount, value),
        }
      : { ...current, [key]: value });
    setSaved(false);
    setError("");
  };
  const toggleCategory = (category: string): void => {
    setSettings((current) => ({
      ...current,
      allowedCategories: current.allowedCategories.includes(category)
        ? current.allowedCategories.filter((item) => item !== category)
        : [...current.allowedCategories, category],
    }));
    setSaved(false);
  };
  const save = (): void => {
    try {
      setSettings(saveRecommendationSettings(window.localStorage, settings));
      setSaved(true);
      setError("");
    } catch (caught) {
      console.error("설정 저장에 실패했습니다.", caught);
      setError("점수·활동·조회수·구독자 범위와 허용 카테고리를 확인해 주세요.");
    }
  };

  return <>
    <PageHeader title="설정" description="마케팅 적합도와 캠페인 목표 범위를 조정합니다." />
    <div className="panel max-w-4xl p-5 sm:p-8">
      {error && <p className="mb-5 rounded-lg bg-rose-50 p-3 text-sm text-rose-700" role="alert">{error}</p>}
      <div className="grid gap-6 sm:grid-cols-2">
        <SettingNumber label="추천 적합도" value={settings.recommendationScoreThreshold} onChange={(value) => setNumber("recommendationScoreThreshold", value)} min={1} max={100} suffix="점" />
        <SettingNumber label="보류 최소 적합도" value={settings.holdScoreThreshold} onChange={(value) => setNumber("holdScoreThreshold", value)} min={0} max={99} suffix="점" />
        <SettingNumber label="최근 업로드 기준" value={settings.maximumDaysSinceLatestUpload} onChange={(value) => setNumber("maximumDaysSinceLatestUpload", value)} min={maximumDaysSinceLatestUploadRange.minimum} max={maximumDaysSinceLatestUploadRange.maximum} suffix="일" />
        <SettingNumber label="최소 업로드 수" value={settings.minimumRecentVideoCount} onChange={(value) => setNumber("minimumRecentVideoCount", value)} min={1} suffix="개" />
        <SettingNumber label="최소 중앙 조회수" value={settings.minimumRecentMedianViews} onChange={(value) => setNumber("minimumRecentMedianViews", value)} min={0} suffix="회" />
        <SettingNumber label="최소 평균 조회수" value={settings.minimumRecentAverageViews} onChange={(value) => setNumber("minimumRecentAverageViews", value)} min={0} suffix="회" />
        <SettingNumber label="최소 구독자 수" value={settings.minimumSubscriberCount} onChange={(value) => setNumber("minimumSubscriberCount", value)} min={0} suffix="명" />
        <SettingNumber label="최대 구독자 수" value={settings.maximumSubscriberCount} onChange={(value) => setNumber("maximumSubscriberCount", value)} min={1} suffix="명" />
      </div>
      <p className="mt-5 rounded-xl bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-600">
        중앙 조회수 또는 평균 조회수 기준 중 하나를 충족하면 도달력 검토를 통과합니다. 바이럴 편중은 자동 제외하지 않고 안정성 점수만 감점합니다.
      </p>
      <fieldset className="mt-8 border-t border-slate-200 pt-6">
        <legend className="font-semibold text-ink">허용 크리에이터 카테고리</legend>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {creatorCategories.map((category) => <label key={category} className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 p-3 hover:bg-slate-50">
            <input type="checkbox" checked={settings.allowedCategories.includes(category)} onChange={() => toggleCategory(category)} className="h-4 w-4 rounded border-slate-300 text-brand focus:ring-brand" />
            <span className="text-sm font-medium">{category}</span>
          </label>)}
        </div>
      </fieldset>
      <div className="mt-8 flex items-center justify-end gap-4 border-t border-slate-200 pt-6">
        {saved && <span className="text-sm font-medium text-emerald-700" role="status">이 브라우저에 저장했습니다.</span>}
        <button type="button" onClick={save} className="button-primary">설정 저장</button>
      </div>
    </div>
  </>;
}

function SettingNumber({
  label,
  value,
  onChange,
  min,
  max,
  suffix,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max?: number;
  suffix: string;
}): React.ReactNode {
  return <label>
    <span className="mb-2 flex items-center justify-between text-sm font-semibold text-slate-700">
      <span>{label}</span><span className="text-xs font-normal text-slate-400">{suffix}</span>
    </span>
    <input type="number" min={min} max={max} className="input" value={value} onChange={(event) => onChange(Number(event.target.value))} />
  </label>;
}
