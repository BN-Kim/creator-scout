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
  ) errors.maximumDaysSinceLatestUpload = "7~90일 사이의 정수를 입력해 주세요.";
  if (input.minimumRecentAverageViews < 0) errors.minimumRecentAverageViews = "0 이상의 값을 입력해 주세요.";
  if (input.minimumRecentMedianViews < 0) errors.minimumRecentMedianViews = "0 이상의 값을 입력해 주세요.";
  if (!Number.isInteger(input.minimumRecentVideoCount) || input.minimumRecentVideoCount < 1) errors.minimumRecentVideoCount = "1 이상의 정수를 입력해 주세요.";
  if (!Number.isInteger(input.minimumSubscriberCount) || input.minimumSubscriberCount < 0) errors.minimumSubscriberCount = "0 이상의 정수를 입력해 주세요.";
  if (!Number.isInteger(input.maximumSubscriberCount) || input.maximumSubscriberCount < 1) errors.maximumSubscriberCount = "1 이상의 정수를 입력해 주세요.";
  if (input.minimumSubscriberCount > input.maximumSubscriberCount) errors.minimumSubscriberCount = "최소 구독자 수는 최대 구독자 수 이하여야 합니다.";
  return errors;
}
