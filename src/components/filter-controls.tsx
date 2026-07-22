import { creatorCategories, decisionLabels } from "@/config/labels";
import type { CreatorDecision } from "@/types/domain";

export function FilterControls({ decision, category, onDecisionChange, onCategoryChange }: { decision: CreatorDecision | "all"; category: string; onDecisionChange: (value: CreatorDecision | "all") => void; onCategoryChange: (value: string) => void }): React.ReactNode {
  return <div className="flex flex-col gap-3 sm:flex-row"><select aria-label="판정 필터" value={decision} onChange={(event) => onDecisionChange(event.target.value as CreatorDecision | "all")} className="input min-w-40"><option value="all">모든 판정</option>{Object.entries(decisionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><select aria-label="카테고리 필터" value={category} onChange={(event) => onCategoryChange(event.target.value)} className="input min-w-40"><option value="all">모든 카테고리</option>{creatorCategories.map((item) => <option key={item}>{item}</option>)}</select></div>;
}
