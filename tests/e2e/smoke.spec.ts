import { expect, test, type Page } from "@playwright/test";

const HISTORY_KEY = "creator-scout-history-v2";
const requiredRoutes = ["/", "/runs/new", "/runs/mock-new-run", "/history", "/settings"] as const;

async function resetBrowserStorage(page: Page): Promise<void> {
  await page.goto("/");
  await page.evaluate(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
}

async function openMockRun(page: Page): Promise<void> {
  await page.goto("/runs/mock-new-run");
  await expect(page.getByRole("heading", { name: "2단계 목 추천 실행" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "추천", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "보류", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "제외", exact: true })).toBeVisible();
}

async function historyRecords(page: Page): Promise<Array<{ id: string; finalDecision: string }>> {
  return page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) ?? "[]") as Array<{ id: string; finalDecision: string }>, HISTORY_KEY);
}

test.beforeEach(async ({ page }) => {
  await resetBrowserStorage(page);
});

test("필수 경로가 모두 성공적으로 로드된다", async ({ page }) => {
  for (const route of requiredRoutes) {
    const response = await page.goto(route);
    expect(response?.ok(), `${route} 응답이 성공이어야 합니다.`).toBe(true);
    await expect(page.locator("main")).toBeVisible();
  }
});

test("새 추천 실행 폼은 무효 입력을 막고 유효 입력을 상세 화면으로 이동시킨다", async ({ page }) => {
  await page.goto("/runs/new");
  await page.getByRole("button", { name: "추천 실행 만들기" }).click();
  await expect(page.getByText("실행 이름을 입력해 주세요.")).toBeVisible();
  await expect(page.getByText("카테고리를 선택해 주세요.")).toBeVisible();
  await expect(page.getByText("검색 키워드를 입력해 주세요.")).toBeVisible();

  await page.getByLabel("스카우팅 실행 이름").fill("H1 목 스모크 실행");
  await page.getByLabel("크리에이터 카테고리").selectOption({ label: "뷰티" });
  await page.getByLabel("검색 키워드").fill("허구 목 키워드");
  await page.getByRole("button", { name: "추천 실행 만들기" }).click();

  await expect(page).toHaveURL(/\/runs\/mock-new-run$/);
  await expect(page.getByRole("heading", { name: "2단계 목 추천 실행" })).toBeVisible();
});

test("추천·보류·제외가 렌더링되고 각 크리에이터는 한 그룹에만 존재한다", async ({ page }) => {
  await openMockRun(page);
  const sections = page.locator("main section.panel");
  await expect(sections).toHaveCount(3);

  const recommendedNames = await sections.nth(0).locator("tbody button").allTextContents();
  const holdNames = await sections.nth(1).locator("tbody button").allTextContents();
  const excludedNames = await sections.nth(2).locator("tbody button").allTextContents();
  expect(recommendedNames).toHaveLength(2);
  expect(holdNames).toHaveLength(4);
  expect(excludedNames).toHaveLength(18);

  const allNames = [...recommendedNames, ...holdNames, ...excludedNames];
  expect(new Set(allNames).size).toBe(allNames.length);
});

test("완료된 목 실행이 히스토리를 자동 갱신한다", async ({ page }) => {
  await openMockRun(page);
  const stored = await historyRecords(page);
  expect(stored).toHaveLength(23);
  expect(new Set(stored.map((record) => record.id)).size).toBe(stored.length);

  await page.goto("/history");
  await expect(page.getByText("총 23개 기록", { exact: false })).toBeVisible();
  await expect(page.getByRole("row", { name: /목 크리에이터 01/ })).toBeVisible();
});

test("수동 교정이 크리에이터를 제외로 이동시키고 표시 히스토리를 갱신한다", async ({ page }) => {
  await openMockRun(page);
  const recommendedSection = page.locator("main section.panel").nth(0);
  await recommendedSection.getByRole("button", { name: "목 크리에이터 01", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "제외로 교정" }).click();

  await expect(page.getByRole("status")).toContainText("제외로 교정하고 히스토리에 반영했습니다.");
  await expect(recommendedSection.getByRole("button", { name: "목 크리에이터 01", exact: true })).toHaveCount(0);
  const excludedSection = page.locator("main section.panel").nth(2);
  await expect(excludedSection.getByRole("button", { name: "목 크리에이터 01", exact: true })).toBeVisible();

  await page.goto("/history");
  const row = page.getByRole("row").filter({ has: page.getByText("목 크리에이터 01", { exact: true }) });
  await expect(row).toBeVisible();
  await expect(row.getByText("제외", { exact: true })).toHaveCount(2);
  await expect(row).toContainText("사용자 교정에 따라 제외되었습니다.");
});

test("반복 실행과 반복 교정은 히스토리 레코드를 중복 생성하지 않는다", async ({ page }) => {
  await openMockRun(page);
  const initial = await historyRecords(page);
  await page.reload();
  await expect(page.getByRole("heading", { name: "2단계 목 추천 실행" })).toBeVisible();
  const afterReload = await historyRecords(page);
  expect(afterReload).toHaveLength(initial.length);

  await page.locator("main section.panel").nth(0).getByRole("button", { name: "목 크리에이터 01", exact: true }).click();
  await page.getByRole("button", { name: "제외로 교정" }).click();
  const afterCorrection = await historyRecords(page);
  await page.locator("main section.panel").nth(2).getByRole("button", { name: "목 크리에이터 01", exact: true }).click();
  await page.getByRole("button", { name: "제외로 교정" }).click();
  const afterRepeatedCorrection = await historyRecords(page);

  expect(afterRepeatedCorrection).toHaveLength(afterCorrection.length);
  expect(new Set(afterRepeatedCorrection.map((record) => record.id)).size).toBe(afterRepeatedCorrection.length);
});
