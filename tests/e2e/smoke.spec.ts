import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const requiredRoutes = ["/runs", "/runs/new", "/runs/mock-new-run", "/runs/automatic-h4-mock-run", "/history", "/settings"] as const;

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

test("스카우트 실행 폼은 스카우팅 목표만으로 자동 실행을 시작한다", async ({ page }) => {
  await page.goto("/runs/new");
  await page.getByLabel("스카우팅 목표").fill("0");
  await page.getByRole("button", { name: "스카우트 시작" }).click();
  await expect(page.getByText("1~500 사이의 스카우팅 목표를 입력해 주세요.")).toBeVisible();

  await page.getByLabel("스카우팅 목표").fill("1");
  await page.getByRole("button", { name: "스카우트 시작" }).click();

  await expect(page).toHaveURL(/\/runs\/automatic-[a-f0-9-]+$/);
  await expect(page.getByRole("heading", { name: "자동 스카우트 실행" })).toBeVisible();
  await expect(page.getByRole("region", { name: "실행 통계" })).toContainText("검색 모드자동 검색어만");
  await expect(page.getByRole("status")).toContainText("1 / 1명 충족");
  await expect(page.getByRole("status")).toContainText("스카우팅 목표를 모두 충족했습니다.");
});

test("저장한 설정 기준이 스카우트 실행 화면과 요청에 적용된다", async ({ page }) => {
  await page.goto("/settings");
  await page.getByLabel("최근 업로드 기준").fill("21");
  await page.getByLabel("최소 평균 조회수").fill("25000");
  await page.getByLabel("최소 업로드 수").fill("4");
  for (const category of ["뷰티", "패션", "푸드", "라이프스타일", "여행"]) {
    await page.getByLabel(category, { exact: true }).uncheck();
  }
  await page.getByRole("button", { name: "설정 저장" }).click();
  await expect(page.getByRole("status")).toContainText("이 브라우저에 저장했습니다.");

  let requestBody: Record<string, unknown> | null = null;
  await page.route("**/api/runs/automatic", async (route) => {
    requestBody = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({ json: { runId: "automatic-h4-mock-run" } });
  });
  await page.getByRole("link", { name: "스카우트 실행" }).click();

  await expect(page.getByLabel("최근 업로드 기준")).toHaveValue("21");
  await expect(page.getByLabel("최소 평균 조회수")).toHaveValue("25000");
  await expect(page.getByLabel("최소 업로드 수")).toHaveValue("4");
  await expect(page.getByLabel("카테고리").locator("option")).toHaveText(["전체", "테크"]);
  await page.getByRole("button", { name: "스카우트 시작" }).click();
  await expect(page).toHaveURL(/\/runs\/automatic-h4-mock-run$/);
  expect(requestBody).toMatchObject({
    maximumDaysSinceLatestUpload: 21,
    minimumRecentAverageViews: 25000,
    minimumRecentVideoCount: 4,
    allowedCategories: ["테크"],
  });
});

test("자동 검색 중 1분 기준 남은 시간이 실시간으로 감소한다", async ({ page }) => {
  await page.route("**/api/runs/automatic", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1_800));
    await route.fulfill({ json: { runId: "automatic-h4-mock-run" } });
  });
  await page.goto("/runs/new");

  const countdown = page.getByLabel("자동 검색 제한 시간");
  await expect(countdown).toContainText("01:00");
  await page.getByRole("button", { name: "스카우트 시작" }).click();
  await expect(countdown).toContainText("00:59", { timeout: 1_600 });
  await expect(page).toHaveURL(/\/runs\/automatic-h4-mock-run$/);
});

test("완료된 실행은 스카우트 기록에서 다시 열 수 있다", async ({ page }) => {
  await page.goto("/runs/new");
  await page.getByLabel("스카우팅 목표").fill("1");
  await page.getByRole("button", { name: "스카우트 시작" }).click();
  await expect(page).toHaveURL(/\/runs\/automatic-[a-f0-9-]+$/);
  const completedRunUrl = page.url();

  await page.goto("/runs");
  await expect(page.getByRole("heading", { name: "스카우트 기록" })).toBeVisible();
  const runLink = page.getByRole("link", { name: /automatic-/ }).first();
  await expect(runLink).toBeVisible();
  await runLink.click();
  await expect(page).toHaveURL(completedRunUrl);
  await expect(page.getByRole("heading", { name: "자동 스카우트 실행" })).toBeVisible();

  await page.goto("/runs");
  await expect(page.getByRole("heading", { name: "스카우트 기록" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "완료" }).first()).toBeVisible();
});

test("히스토리는 내보내기 명칭과 KST 판정 시각을 표시한다", async ({ page }) => {
  await page.goto("/history");
  await expect(page.getByRole("button", { name: "히스토리 내보내기" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: /판정 시각\(KST\)/ })).toBeVisible();
  await expect(page.getByText("JSON 내보내기", { exact: true })).toHaveCount(0);
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
  await expect(row.getByText("제외", { exact: true })).toHaveCount(1);
  await expect(row).toContainText("사용자 교정 제외");
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
  await expect(page.getByRole("heading", { name: "자동 스카우트 실행" })).toBeVisible();
  const stats = page.getByRole("region", { name: "실행 통계" });
  await expect(stats).toContainText("검색 모드추가 검색어만");
  await expect(stats).toContainText("시도한 검색어1");
  await expect(stats).toContainText("스카우팅 목표1");
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

test("간소화된 메뉴와 기존 진입 주소는 스카우트 실행으로 연결된다", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL("/runs/new");
  const navigation = page.getByRole("navigation", { name: "주요 메뉴" });
  await expect(navigation.getByRole("link", { name: "스카우트 실행" })).toBeVisible();
  await expect(navigation.getByRole("link", { name: "스카우트 기록" })).toBeVisible();
  await expect(navigation.getByRole("link", { name: "크리에이터 히스토리" })).toBeVisible();
  await expect(navigation.getByRole("link", { name: "설정" })).toBeVisible();
  await expect(navigation.getByRole("link", { name: "대시보드" })).toHaveCount(0);
  await expect(navigation.getByRole("link", { name: "운영 제어" })).toHaveCount(0);

  await page.goto("/operations");
  await expect(page).toHaveURL("/runs/new");
});
