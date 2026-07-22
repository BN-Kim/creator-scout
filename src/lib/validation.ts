import type { NewRunInput } from "@/types/domain";

export type ValidationErrors = Partial<Record<keyof NewRunInput, string>>;

export function validateNewRun(input: NewRunInput): ValidationErrors {
  const errors: ValidationErrors = {};
  if (!input.name.trim()) errors.name = "실행 이름을 입력해 주세요.";
  if (!input.category) errors.category = "카테고리를 선택해 주세요.";
  if (!input.keywords.trim()) errors.keywords = "검색 키워드를 입력해 주세요.";
  if (!Number.isInteger(input.targetCount) || input.targetCount < 1 || input.targetCount > 500) errors.targetCount = "1~500 사이의 정수를 입력해 주세요.";
  if (!Number.isInteger(input.maximumDaysSinceLatestUpload) || input.maximumDaysSinceLatestUpload < 42 || input.maximumDaysSinceLatestUpload > 56) errors.maximumDaysSinceLatestUpload = "42~56일 사이의 정수를 입력해 주세요.";
  if (input.minimumRecentAverageViews < 0) errors.minimumRecentAverageViews = "0 이상의 값을 입력해 주세요.";
  if (!Number.isInteger(input.minimumRecentVideoCount) || input.minimumRecentVideoCount < 2) errors.minimumRecentVideoCount = "2 이상의 정수를 입력해 주세요.";
  return errors;
}
