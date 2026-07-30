import { maximumDaysSinceLatestUploadRange } from "@/config/recommendation-rules";
import type { NewRunInput } from "@/types/domain";

export type ValidationErrors = Partial<Record<keyof NewRunInput, string>>;

export function validateNewRun(input: NewRunInput): ValidationErrors {
  const errors: ValidationErrors = {};
  if ((input.discoveryMode ?? "manual_replace") !== "automatic" && !input.keywords.trim()) errors.keywords = "추가 검색어 모드에는 검색어를 입력해 주세요.";
  if (!Number.isInteger(input.targetRecommendedCount) || input.targetRecommendedCount < 1 || input.targetRecommendedCount > 500) errors.targetRecommendedCount = "1~500 사이의 스카우팅 목표를 입력해 주세요.";
  if (
    !Number.isInteger(input.maximumDaysSinceLatestUpload)
    || input.maximumDaysSinceLatestUpload < maximumDaysSinceLatestUploadRange.minimum
    || input.maximumDaysSinceLatestUpload > maximumDaysSinceLatestUploadRange.maximum
  ) errors.maximumDaysSinceLatestUpload = "7~60일 사이의 정수를 입력해 주세요.";
  if (input.minimumRecentAverageViews < 0) errors.minimumRecentAverageViews = "0 이상의 값을 입력해 주세요.";
  if (!Number.isInteger(input.minimumRecentVideoCount) || input.minimumRecentVideoCount < 2) errors.minimumRecentVideoCount = "2 이상의 정수를 입력해 주세요.";
  return errors;
}
