import { expect, test, type Page } from "@playwright/test";

const requestId = "11111111-1111-4111-8111-111111111111";
const diagnosticId = "22222222-2222-4222-8222-222222222222";
const now = Date.now();
const layout243 = {
  template: "243",
  drone_cap: 235,
  scenario: {},
  rooms: [{ id: "workshop", kind: "workshop", level: 3 }],
};

const profile = {
  schema_version: 4,
  layout_label: "243",
  operbox_label: "243 全精二示例",
  baseline_label: "产品推荐基准",
  summary: { owned: 1, tier_up_owned: 1, trade_pool_ready: 1, manufacture_pool_ready: 1 },
  domains: [],
  rotation: {},
  baseline_rotation: {},
  actions: [],
  flags: [],
  narration_hints: [],
};

function maaPlan(index: number) {
  return {
    name: `班次 ${index + 1}`,
    description: `固定测试班次 ${index + 1}`,
    rooms: {
      processing: [{ operators: ["阿米娅"] }],
    },
  };
}

const planData = {
  profile,
  maa: {
    title: "明日方舟基建排班助手 · 243",
    plans: [maaPlan(0), maaPlan(1), maaPlan(2)],
  },
  rotation: {
    shifts: [0, 1, 2].map((index) => ({
      index,
      duration_hours: index === 0 ? 12 : 6,
      active_teams: ["A"],
      resting_team: "B",
      scores: { trade_score: 0, manu_prod_sum: 0, power_charge_sum: 0, room_lines: [] },
      weighted_trade: 0,
      weighted_manu: 0,
      weighted_power: 0,
    })),
    daily: { trade: 0, manu: 0, power: 0 },
  },
  durationMs: 42,
  diagnosticId,
};

const sampleData = [{
  id: "char_002_amiya",
  name: "阿米娅",
  elite: 2,
  level: 80,
  own: true,
  potential: 6,
  rarity: 5,
}];

const sklandSnapshot = {
  player: {
    uid: "123456789",
    nickname: "测试博士",
    level: 120,
    channelName: "官服",
    storeTs: Math.floor(now / 1000),
    lastOnlineTs: Math.floor(now / 1000),
  },
  roles: [{
    uid: "123456789",
    nickname: "测试博士",
    channelName: "官服",
    isDefault: true,
  }],
  operbox: sampleData,
  infrastructure: {
    currentTs: Math.floor(now / 1000),
    storeTs: Math.floor(now / 1000),
    layoutLabel: "243",
    layoutSuggestion: layout243,
    layoutWarning: null,
    rooms: [],
    tiredOperators: [],
    labor: { value: 80, maxValue: 200, remainSecs: 120 },
    training: null,
  },
  sourceName: "森空岛 · 测试博士",
  warnings: [],
};

async function mockApis(
  page: Page,
  options: { debugTools?: boolean; sklandConfigured?: boolean } = {}
) {
  await page.route("**/api/health", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    headers: { "X-Request-Id": requestId },
    body: JSON.stringify({
      success: true,
      data: {
        status: "ready",
        plannerReady: true,
        skland: {
          available: Boolean(options.sklandConfigured),
          message: options.sklandConfigured ? null : "当前未开放森空岛登录，可使用 MAA 导入。",
        },
        features: { debugTools: Boolean(options.debugTools), rateLimit: false },
      },
      requestId,
    }),
  }));
  await page.route("**/api/skland/session", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      success: true,
      data: {
        authenticated: false,
        configured: Boolean(options.sklandConfigured),
        authMethods: { qr: true, phoneCode: true },
        disabledReason: options.sklandConfigured
          ? null
          : "当前未开放森空岛登录，可使用 MAA 导入。",
      },
      requestId,
    }),
  }));
  await page.route("**/api/sample-operbox", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      success: true,
      data: { sourceName: "243 全精二示例", operbox: sampleData },
      requestId,
    }),
  }));
  await page.route("**/api/plan", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      success: true,
      data: options.debugTools
        ? {
            ...planData,
            debug: {
              command: "infra-cli serve",
              stdout: "test output",
              stderr: "",
              debugBundle: { version: "test" },
            },
          }
        : planData,
      requestId,
    }),
  }));
  await page.route("**/api/feedback", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      success: true,
      data: { feedbackId: "feedback-001", savedAt: "2026-07-28T00:00:00.000Z" },
      requestId,
    }),
  }));
}

async function seedPreferences(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem("arknights-infra-calc-beta-onboarding-v1", "1");
  });
}

async function seedV4Session(page: Page) {
  await page.addInitScript(({ layout, result, savedAt, expiresAt }) => {
    window.localStorage.setItem("arknights-infra-calc-beta-onboarding-v1", "1");
    window.localStorage.setItem("arknights-infra-calc-session-v4", JSON.stringify({
      version: 4,
      savedAt,
      expiresAt,
      presetLabel: "243",
      layout,
      operbox: [{
        id: "char_002_amiya",
        name: "阿米娅",
        elite: 2,
        level: 80,
        own: true,
        potential: 6,
        rarity: 5,
      }],
      sourceName: "243 全精二示例",
      boxSource: "sample",
      layoutDirty: false,
      result,
      activeShift: 0,
    }));
  }, {
    layout: layout243,
    result: planData,
    savedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + 30 * 24 * 60 * 60 * 1000).toISOString(),
  });
}

test("restores a v4 schedule without hydration errors and keeps only safe data", async ({ page }) => {
  await mockApis(page);
  await seedV4Session(page);
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await page.goto("/");
  await expect(page.getByText("明日方舟基建排班助手 · 243")).toBeVisible();
  await page.reload();
  await expect(page.getByText("排班已生成")).toBeVisible();
  expect(consoleErrors.filter((message) => /hydration|did not match/i.test(message))).toEqual([]);

  const persisted = await page.evaluate(() => JSON.parse(
    window.localStorage.getItem("arknights-infra-calc-session-v4") ?? "{}"
  ));
  expect(persisted.savedAt).toBeTruthy();
  expect(persisted.expiresAt).toBeTruthy();
  expect(persisted.result.debug).toBeUndefined();
  expect(JSON.stringify(persisted)).not.toContain("cliPath");
  expect(JSON.stringify(persisted)).not.toContain("stdout");
});

test("ignores root attributes injected by browser extensions during hydration", async ({ page }) => {
  await mockApis(page);
  await seedPreferences(page);
  await page.route("**/", async (route) => {
    const response = await route.fetch();
    const body = (await response.text()).replace(
      /<html([^>]*)>/,
      '<html$1 data-fabric-scheme="dark">'
    );
    await route.fulfill({ response, body });
  });
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-fabric-scheme", "dark");
  expect(consoleErrors.filter((message) => /hydration|did not match/i.test(message))).toEqual([]);
});

test("?beta cannot enable debug tools without the server feature flag", async ({ page }) => {
  await mockApis(page, { debugTools: false });
  await seedPreferences(page);
  await page.goto("/?beta");
  await expect(page.getByText("排班服务已就绪")).toBeVisible();
  await expect(page.getByText("调试输出")).toHaveCount(0);
  await expect(page.getByText("问题上下文")).toHaveCount(0);
});

test("the server flag plus ?beta enables the debug panels", async ({ page }) => {
  await mockApis(page, { debugTools: true });
  await seedPreferences(page);
  await page.goto("/?beta");
  await expect(page.getByText("调试输出")).toBeVisible();
  await expect(page.getByText("问题上下文")).toBeVisible();
});

test("Full E2 stays in place and completes generation, shifts, MAA export, and feedback", async ({ page }) => {
  await mockApis(page);
  await seedPreferences(page);
  await page.goto("/");
  await expect(page.getByText("排班服务已就绪")).toBeVisible();

  const fullE2 = page.getByRole("button", { name: "载入 243 全精二测试干员数据" });
  await expect(fullE2).toBeVisible();
  await fullE2.click();
  await expect(page.getByText("先导入干员数据")).toHaveCount(0);

  await page.getByRole("button", { name: "生成排班" }).click();
  await expect(page.getByText("排班已生成")).toBeVisible();
  await page.getByRole("tab", { name: /β 6h/ }).click();
  await expect(page.getByText("固定测试班次 2")).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出到 MAA" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("arknights-infra-schedule-maa.json");

  await page.getByRole("button", { name: "加工站 反馈排班问题" }).click();
  await page.getByPlaceholder(/这组应该换成/).fill("加工站排班与预期不一致");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "提交反馈" }).click();
  await expect(page.getByText("反馈已提交，编号：feedback-001")).toBeVisible();
});

test("responsive navigation and the two locked areas keep their current behavior", async ({ page }) => {
  await mockApis(page);
  await seedV4Session(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  await expect(page.getByRole("tab", { name: "一图流布局" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "一图流布局" })).toBeDisabled();
  await expect(page.getByText("加工站")).toBeVisible();

  await page.getByRole("button", { name: /功能设施/ }).click();
  const keepHiddenButton = page.getByRole("button", { name: "暂不显示" });
  await expect(keepHiddenButton).toBeVisible();
  await keepHiddenButton.click();
  await expect(page.getByRole("button", { name: "恢复已隐藏（1）" })).toBeVisible();

  for (const viewport of [
    { width: 768, height: 900 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    await page.reload();
    await expect(page.getByText("排班已生成")).toBeVisible();
    await expect(page.getByRole("button", { name: "载入 243 全精二测试干员数据" })).toBeVisible();
  }

  await expect(page.getByRole("button", { name: "基建计算器" })).toBeVisible();
  await expect(page.getByRole("button", { name: "练卡建议" })).toBeVisible();
  await expect(page.getByRole("button", { name: "森空岛状态" })).toBeVisible();
});

test("Skland login supports app authorization and SMS without a password flow", async ({ page }) => {
  await mockApis(page, { sklandConfigured: true });
  await page.route("**/api/skland/auth/qr", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      success: true,
      data: {
        scanId: "scan-login-1",
        scanUrl: "https://as.hypergryph.com/scan/test-login",
      },
      requestId,
    }),
  }));
  await page.route("**/api/skland/auth/qr/status", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      success: true,
      data: { status: "waiting" },
      requestId,
    }),
  }));
  await page.route("**/api/skland/auth/phone/code", async (route) => {
    expect((await route.request().postDataJSON()).phone).toBe("138 0013 8000");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: {
          challengeId: "phone-challenge-1",
          expiresInSeconds: 600,
          resendAfterSeconds: 60,
        },
        requestId,
      }),
    });
  });
  await page.route("**/api/skland/auth/phone/code/verify", async (route) => {
    expect(await route.request().postDataJSON()).toEqual({
      challengeId: "phone-challenge-1",
      code: "123456",
    });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: { snapshot: sklandSnapshot },
        requestId,
      }),
    });
  });
  await seedPreferences(page);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");

  const accountButton = page.getByRole("button", { name: "登录森空岛" });
  await accountButton.click();
  await expect(page.getByRole("heading", { name: "登录森空岛" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "App 授权" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "验证码" })).toBeVisible();
  await expect(page.getByRole("tab", { name: /密码/ })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "在手机上打开森空岛授权" })).toHaveAttribute(
    "href",
    "https://as.hypergryph.com/scan/test-login"
  );

  await page.keyboard.press("Escape");
  await expect(page.getByRole("heading", { name: "登录森空岛" })).toHaveCount(0);
  await expect(accountButton).toBeFocused();

  await page.setViewportSize({ width: 1024, height: 800 });
  await accountButton.click();
  await expect(page.getByRole("img", { name: "森空岛登录二维码" })).toBeVisible();
  await expect(page.getByRole("link", { name: "在手机上打开森空岛授权" })).toBeHidden();
  await page.keyboard.press("Escape");

  await page.setViewportSize({ width: 375, height: 812 });
  await accountButton.click();

  const appTab = page.getByRole("tab", { name: "App 授权" });
  await appTab.focus();
  await page.keyboard.press("ArrowRight");
  const phoneTab = page.getByRole("tab", { name: "验证码" });
  await expect(phoneTab).toHaveAttribute("aria-selected", "true");

  await page.getByRole("button", { name: "获取验证码" }).click();
  await expect(page.getByLabel("鹰角通行证手机号")).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByText("请输入有效的中国大陆手机号。")).toBeVisible();

  await page.getByLabel("鹰角通行证手机号").fill("138 0013 8000");
  await page.getByRole("button", { name: "获取验证码" }).click();
  await expect(page.getByRole("button", { name: "60 秒后重发" })).toBeDisabled();
  await page.getByLabel("短信验证码").fill("123456");
  await page.getByRole("button", { name: "验证码登录" }).click();

  await expect(page.getByRole("heading", { name: "登录森空岛" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "森空岛账号：测试博士" })).toBeVisible();
});

test("settings clears local product data without logging out of Skland", async ({ page }) => {
  await mockApis(page);
  await seedV4Session(page);
  let logoutRequests = 0;
  page.on("request", (request) => {
    if (request.url().includes("/api/skland/session") && request.method() === "DELETE") {
      logoutRequests += 1;
    }
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  await page.getByRole("button", { name: "配置干员数据与布局" }).click();
  await page.getByRole("tab", { name: /导入干员数据/ }).click();
  const storageCopy = page.getByText(/会在此浏览器保存 30 天/);
  await storageCopy.scrollIntoViewIfNeeded();
  await expect(storageCopy).toBeVisible();
  await page.getByRole("button", { name: "清除本地数据" }).first().click();
  await expect(page.getByRole("heading", { name: "清除本地数据？" })).toBeVisible();
  await page.getByRole("button", { name: "清除本地数据" }).last().click();

  const stored = await page.evaluate(() => ({
    v2: window.localStorage.getItem("arknights-infra-calc-beta-session-v2"),
    v3: window.localStorage.getItem("arknights-infra-calc-beta-session-v3"),
    v4: window.localStorage.getItem("arknights-infra-calc-session-v4"),
    onboarding: window.localStorage.getItem("arknights-infra-calc-beta-onboarding-v1"),
  }));
  expect(stored).toEqual({ v2: null, v3: null, v4: null, onboarding: null });
  expect(logoutRequests).toBe(0);
});
