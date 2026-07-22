"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { creatorCategories } from "@/config/labels";
import { validateNewRun, type ValidationErrors } from "@/lib/validation";
import type { NewRunInput } from "@/types/domain";

const initialValues: NewRunInput = { name: "", category: "", keywords: "", targetCount: 50, maximumDaysSinceLatestUpload: 56, minimumRecentAverageViews: 10000, minimumRecentVideoCount: 2 };

export default function NewRunPage(): React.ReactNode {
  const router = useRouter();
  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const setField = <K extends keyof NewRunInput>(key: K, value: NewRunInput[K]): void => setValues((current) => ({ ...current, [key]: value }));
  const submit = (event: React.FormEvent<HTMLFormElement>): void => { event.preventDefault(); if (submitting) return; const nextErrors = validateNewRun(values); setErrors(nextErrors); if (Object.keys(nextErrors).length === 0) { setSubmitting(true); window.sessionStorage.setItem("mock-scouting-run-input", JSON.stringify(values)); router.push("/runs/mock-new-run"); } };
  return <><PageHeader title="새 추천 실행" description="검색 조건과 최소 검증 기준을 설정해 새로운 스카우팅을 준비합니다." /><form onSubmit={submit} noValidate className="panel max-w-4xl p-5 sm:p-8"><div className="grid gap-6 sm:grid-cols-2"><Field label="스카우팅 실행 이름" error={errors.name} wide><input className="input" value={values.name} onChange={(e) => setField("name", e.target.value)} placeholder="예: 8월 뷰티 신규 크리에이터" /></Field><Field label="크리에이터 카테고리" error={errors.category}><select className="input" value={values.category} onChange={(e) => setField("category", e.target.value)}><option value="">선택해 주세요</option>{creatorCategories.map((category) => <option key={category}>{category}</option>)}</select></Field><Field label="검색 키워드" error={errors.keywords}><input className="input" value={values.keywords} onChange={(e) => setField("keywords", e.target.value)} placeholder="쉼표로 여러 키워드 구분" /></Field><Field label="목표 크리에이터 수" error={errors.targetCount}><NumberInput value={values.targetCount} onChange={(value) => setField("targetCount", value)} min={1} max={500} /></Field><Field label="최근 업로드 허용 최대 경과일" error={errors.maximumDaysSinceLatestUpload} hint="42~56일"><NumberInput value={values.maximumDaysSinceLatestUpload} onChange={(value) => setField("maximumDaysSinceLatestUpload", value)} min={42} max={56} /></Field><Field label="최소 최근 평균 조회수" error={errors.minimumRecentAverageViews} hint="조회수"><NumberInput value={values.minimumRecentAverageViews} onChange={(value) => setField("minimumRecentAverageViews", value)} min={0} /></Field><Field label="최소 최근 영상 수" error={errors.minimumRecentVideoCount} hint="영상 개수"><NumberInput value={values.minimumRecentVideoCount} onChange={(value) => setField("minimumRecentVideoCount", value)} min={2} /></Field></div><div className="mt-8 flex items-center justify-between border-t border-slate-200 pt-6"><p className="text-xs text-slate-500">제출하면 목 근거를 규칙 엔진으로 평가하고 히스토리에 자동 반영합니다.</p><button className="button-primary" type="submit" disabled={submitting}>{submitting ? "처리 중…" : "추천 실행 만들기"}</button></div></form></>;
}

function Field({ label, error, hint, wide, children }: { label: string; error?: string; hint?: string; wide?: boolean; children: React.ReactNode }): React.ReactNode { return <label className={wide ? "sm:col-span-2" : ""}><span className="mb-2 flex items-center justify-between text-sm font-semibold text-slate-700"><span>{label}</span>{hint && <span className="text-xs font-normal text-slate-400">{hint}</span>}</span>{children}{error && <span className="mt-1.5 block text-xs font-medium text-rose-600">{error}</span>}</label>; }
function NumberInput({ value, onChange, min, max }: { value: number; onChange: (value: number) => void; min: number; max?: number }): React.ReactNode { return <input type="number" className="input" value={value} min={min} max={max} onChange={(e) => onChange(Number(e.target.value))} />; }
