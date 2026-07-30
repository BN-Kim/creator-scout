"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { creatorCategories } from "@/config/labels";
import { defaultRecommendationSettings, maximumDaysSinceLatestUploadRange, recommendationSettingsSchema } from "@/config/recommendation-rules";
import type { RecommendationSettings } from "@/types/domain";

const storageKey = "creator-recommendation-settings-v2";

export default function SettingsPage(): React.ReactNode {
  const [settings, setSettings] = useState<RecommendationSettings>(defaultRecommendationSettings); const [saved, setSaved] = useState(false); const [error, setError] = useState("");
  useEffect(() => { const stored = window.localStorage.getItem(storageKey); if (!stored) return; try { const parsed: unknown = JSON.parse(stored); setSettings(recommendationSettingsSchema.parse(parsed)); } catch (caught) { console.error("저장된 설정을 불러오지 못했습니다.", caught); setError("저장된 설정이 유효하지 않아 기본값을 사용합니다."); } }, []);
  const setNumber = (key: "minimumRecentAverageViews" | "maximumDaysSinceLatestUpload" | "minimumRecentVideoCount", value: number): void => { setSettings((current) => ({ ...current, [key]: value })); setSaved(false); setError(""); };
  const toggleCategory = (category: string): void => { setSettings((current) => ({ ...current, allowedCategories: current.allowedCategories.includes(category) ? current.allowedCategories.filter((item) => item !== category) : [...current.allowedCategories, category] })); setSaved(false); };
  const save = (): void => { try { const validated = recommendationSettingsSchema.parse(settings); window.localStorage.setItem(storageKey, JSON.stringify(validated)); setSaved(true); setError(""); } catch (caught) { console.error("설정 저장에 실패했습니다.", caught); setError("활동 기간은 7~60일이며 허용 카테고리를 하나 이상 선택해야 합니다."); } };
  return <><PageHeader title="설정" description="결정론적 평가 엔진의 기준을 이 브라우저에 저장합니다." /><div className="panel max-w-3xl p-5 sm:p-8">{error && <p className="mb-5 rounded-lg bg-rose-50 p-3 text-sm text-rose-700" role="alert">{error}</p>}<div className="grid gap-6 sm:grid-cols-2"><SettingNumber label="최소 평균 조회수" value={settings.minimumRecentAverageViews} onChange={(value) => setNumber("minimumRecentAverageViews", value)} min={0} /><SettingNumber label="최근 업로드 기준" value={settings.maximumDaysSinceLatestUpload} onChange={(value) => setNumber("maximumDaysSinceLatestUpload", value)} min={maximumDaysSinceLatestUploadRange.minimum} max={maximumDaysSinceLatestUploadRange.maximum} /><SettingNumber label="최소 업로드 수" value={settings.minimumRecentVideoCount} onChange={(value) => setNumber("minimumRecentVideoCount", value)} min={2} /></div><fieldset className="mt-8 border-t border-slate-200 pt-6"><legend className="font-semibold text-ink">허용 크리에이터 카테고리</legend><div className="mt-4 grid gap-3 sm:grid-cols-2">{creatorCategories.map((category) => <label key={category} className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 p-3 hover:bg-slate-50"><input type="checkbox" checked={settings.allowedCategories.includes(category)} onChange={() => toggleCategory(category)} className="h-4 w-4 rounded border-slate-300 text-brand focus:ring-brand" /><span className="text-sm font-medium">{category}</span></label>)}</div></fieldset><div className="mt-8 flex items-center justify-end gap-4 border-t border-slate-200 pt-6">{saved && <span className="text-sm font-medium text-emerald-700" role="status">이 브라우저에 저장했습니다.</span>}<button type="button" onClick={save} className="button-primary">설정 저장</button></div></div></>;
}

function SettingNumber({ label, value, onChange, min, max }: { label: string; value: number; onChange: (value: number) => void; min: number; max?: number }): React.ReactNode { return <label><span className="mb-2 block text-sm font-semibold text-slate-700">{label}</span><input type="number" min={min} max={max} className="input" value={value} onChange={(e) => onChange(Number(e.target.value))} /></label>; }
