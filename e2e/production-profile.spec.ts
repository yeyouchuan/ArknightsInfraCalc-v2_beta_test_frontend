import { expect, test } from "@playwright/test";

test("production profile removes Skland UI, requests, health data, and API access", async ({ page, request }) => {
  test.setTimeout(60_000);
  const sklandRequests: string[] = [];
  page.on("request", (browserRequest) => {
    if (new URL(browserRequest.url()).pathname.startsWith("/api/skland/")) {
      sklandRequests.push(browserRequest.url());
    }
  });
  await page.addInitScript(() => {
    window.localStorage.setItem("arknights-infra-calc-beta-onboarding-v1", "1");
  });

  await page.goto("/");
  await expect(page.getByRole("button", { name: "基建计算器", exact: true })).toBeVisible();
  await expect(page.getByText("森空岛", { exact: false })).toHaveCount(0);
  await expect(page.getByText("调试工具", { exact: false })).toHaveCount(0);
  expect(sklandRequests).toEqual([]);

  await page.getByRole("button", { name: "配置Box与布局" }).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByText("森空岛", { exact: false })).toHaveCount(0);
  await expect(page.getByText("上传练度 JSON / XLSX", { exact: true })).toBeVisible();

  const healthResponse = await request.get("/api/health");
  expect([200, 503]).toContain(healthResponse.status());
  const health = await healthResponse.json();
  expect(health.success).toBe(true);
  expect(health.data).not.toHaveProperty("skland");
  expect(health.data.features).toMatchObject({ debugTools: false, rateLimit: true });

  const sessionResponse = await request.get("/api/skland/session");
  expect(sessionResponse.status()).toBe(404);
  expect(await sessionResponse.json()).toMatchObject({
    success: false,
    error: { code: "AIC-AUTH-2007", retryable: false },
  });

  await page.goto("/terms");
  await expect(page.getByText("森空岛", { exact: false })).toHaveCount(0);
  await page.goto("/privacy");
  await expect(page.getByText("森空岛", { exact: false })).toHaveCount(0);
});
