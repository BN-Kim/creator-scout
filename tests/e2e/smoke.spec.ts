import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const requiredRoutes = ["/", "/runs/new", "/runs/mock-new-run", "/runs/automatic-h4-mock-run", "/history", "/settings", "/operations"] as const;

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
  return page.evaluate(async () => {
    const response = await fetch("/api/history");
    return await response.json() as Array<{ id: string; finalDecision: string }>;
  });
}

async function resetServerHistory(request: APIRequestContext): Promise<void> {
  const response = await request.post("/api/test/history-reset", { headers: { "x-e2e-test": "reset-history" } });
  expect(response.ok()).toBe(true);
}

test.beforeEach(async ({ page, request }) => {
  await resetServerHistory(request);
  await resetBrowserStorage(page);
});

test("필수 경로가 모두 성공적으로 로드된다", async ({ page }) => {
  for (const route of requiredRoutes) {
    const response = await page.goto(route);
    expect(response?.ok(), `${route} 응답이 성공이어야 합니다.`).toBe(true);
    await expect(page.locator("main")).toBeVisible();
  }
});

test("새 추천 실행 폼은 추천 목표만으로 자동 실행을 시작한다", async ({ page }) => {
  await page.goto("/runs/new");
  await page.getByLabel("추천 목표 수").fill("0");
  await page.getByRole("button", { name: "추천 실행 시작" }).click();
  await expect(page.getByText("1~500 사이의 추천 목표를 입력해 주세요.")).toBeVisible();

  await page.getByLabel("추천 목표 수").fill("1");
  await page.getByRole("button", { name: "추천 실행 시작" }).click();

  await expect(page).toHaveURL(/\/runs\/automatic-[a-f0-9-]+$/);
  await expect(page.getByRole("heading", { name: "자동 추천 실행" })).toBeVisible();
  await expect(page.getByRole("region", { name: "실행 통계" })).toContainText("발견 모드자동");
  await expect(page.getByRole("status")).toContainText("1 / 1명 충족");
  await expect(page.getByRole("status")).toContainText("추천 목표를 모두 충족했습니다.");
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

test("제외 사유와 보류의 정확한 미확인 근거를 분리해 표시한다", async ({ page }) => {
  await openMockRun(page);
  const sections = page.locator("main section.panel");

  await sections.nth(2).getByRole("button", { name: "목 크리에이터 07", exact: true }).click();
  const excludedDialog = page.getByRole("dialog");
  await expect(excludedDialog.getByRole("heading", { name: "제외 사유" })).toBeVisible();
  await expect(excludedDialog).not.toContainText("보류되었습니다");
  await expect(excludedDialog.getByRole("heading", { name: "미확인·미점검 근거" })).toBeVisible();
  await excludedDialog.getByRole("button", { name: "상세 패널 닫기" }).click();

  await sections.nth(1).getByRole("button", { name: "목 크리에이터 05", exact: true }).click();
  const holdDialog = page.getByRole("dialog");
  await expect(holdDialog.getByRole("heading", { name: "보류 사유" })).toBeVisible();
  await expect(holdDialog).toContainText("대표 최근 조회수 확인이 필요합니다.");
});

test("완료된 목 실행이 모든 브라우저에서 조회되는 서버 히스토리를 자동 갱신한다", async ({ page, browser }) => {
  await openMockRun(page);
  const stored = await historyRecords(page);
  expect(stored).toHaveLength(23);
  expect(new Set(stored.map((record) => record.id)).size).toBe(stored.length);

  await page.goto("/history");
  await expect(page.getByText("총 23개 기록", { exact: false })).toBeVisible();
  await expect(page.getByRole("row", { name: /목 크리에이터 01/ })).toBeVisible();

  const otherContext = await browser.newContext();
  const otherPage = await otherContext.newPage();
  await otherPage.goto("/history");
  await expect(otherPage.getByText("총 23개 기록", { exact: false })).toBeVisible();
  await otherContext.close();
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

test("H4 자동 실행은 신규 결과만 표시하고 반복 실행에도 히스토리를 중복 생성하지 않는다", async ({ page }) => {
  await page.goto("/runs/automatic-h4-mock-run");
  await expect(page.getByRole("heading", { name: "자동 추천 실행" })).toBeVisible();
  const stats = page.getByRole("region", { name: "실행 통계" });
  await expect(stats).toContainText("발견 모드직접 입력만");
  await expect(stats).toContainText("시도한 검색어1");
  await expect(stats).toContainText("추천 목표1");
  await expect(stats).toContainText("추천 충족1");
  await expect(stats).toContainText("발견6");
  await expect(stats).toContainText("과거 중복1");
  await expect(stats).toContainText("실행 내 중복1");
  await expect(stats).toContainText("평가3");
  await expect(stats).toContainText("추천1");
  await expect(stats).toContainText("보류1");
  await expect(stats).toContainText("제외1");
  await expect(stats).toContainText("실패1");

  await expect(page.getByText("H4 허구 추천 채널", { exact: true })).toHaveCount(1);
  await expect(page.getByText("H4 허구 보류 채널", { exact: true })).toHaveCount(1);
  await expect(page.getByText("H4 허구 제외 채널", { exact: true })).toHaveCount(1);
  await expect(page.getByText("H4 허구 과거 채널", { exact: true })).toHaveCount(0);
  await expect(page.getByText("H4 허구 실패 채널", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText("1 / 1명 충족");

  const firstHistory = await historyRecords(page);
  expect(firstHistory).toHaveLength(4);
  expect(new Set(firstHistory.map((record) => record.id)).size).toBe(4);

  await page.reload();
  await expect(page.getByText("새로 처리된 결과가 없습니다", { exact: true })).toBeVisible();
  const repeatedHistory = await historyRecords(page);
  expect(repeatedHistory).toHaveLength(4);
  expect(new Set(repeatedHistory.map((record) => record.id)).size).toBe(4);
});

test("H6 운영 화면은 중지·재개와 예약 활성 상태를 제어한다", async ({ page }) => {
  await page.goto("/operations");
  await expect(page.getByRole("heading", { name: "운영 제어" })).toBeVisible();
  const status = page.getByRole("region", { name: "운영 상태" });
  await expect(status).toContainText("운영 중");
  await page.getByRole("button", { name: "운영 중지" }).click();
  await expect(status).toContainText("운영 중지");
  await expect(page.getByRole("status")).toContainText("운영을 중지했습니다.");
  await page.getByRole("button", { name: "운영 재개" }).click();
  await expect(status).toContainText("운영 중");

  await page.getByLabel("예약 이름").fill("H6 허구 정기 실행");
  await page.getByLabel("실행 간격(분)").fill("60");
  await page.getByLabel("추천 목표 수").fill("3");
  await page.getByRole("button", { name: "예약 저장" }).click();
  const row = page.getByRole("row").filter({ hasText: "H6 허구 정기 실행" });
  await expect(row).toContainText("60분");
  await expect(row).toContainText("3명");
  await row.getByRole("button", { name: "예약 중지" }).click();
  await expect(row.getByRole("button", { name: "예약 활성화" })).toBeVisible();
});
