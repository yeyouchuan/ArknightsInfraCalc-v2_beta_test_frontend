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
  rotation_profile: "abc_12_6_6",
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
    profile: "abc_12_6_6",
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

function rotationResultData({
  rotationProfile,
  durations,
  profileOverrides = {},
}: {
  rotationProfile: "abc_12_6_6" | "main_backup_12_12" | "fiammetta_8_8_4_4" | "abyssal_7_5_7_5";
  durations: number[];
  profileOverrides?: Record<string, unknown>;
}) {
  return {
    ...planData,
    profile: {
      ...profile,
      rotation_profile: rotationProfile,
      ...profileOverrides,
    },
    maa: {
      ...planData.maa,
      plans: durations.map((_, index) => maaPlan(index)),
    },
    rotation: {
      profile: rotationProfile,
      shifts: durations.map((duration, index) => ({
        index,
        duration_hours: duration,
        active_teams: index % 2 === 0 ? ["alpha"] : ["beta"],
        resting_team: index % 2 === 0 ? "beta" : "alpha",
        scores: { trade_score: 0, manu_prod_sum: 0, power_charge_sum: 0, room_lines: [] },
        weighted_trade: 0,
        weighted_manu: 0,
        weighted_power: 0,
      })),
      daily: { trade: 5.288, manu: 9.175, power: 3.552 },
    },
  };
}

const twoShiftPlanData = rotationResultData({
  rotationProfile: "main_backup_12_12",
  durations: [12, 12],
  profileOverrides: {
    rotation: {
      daily_trade_efficiency: 5.288,
      daily_manufacture_efficiency: 9.175,
      daily_power_efficiency: 3.552,
    },
    baseline_rotation: {
      daily_trade_efficiency: 4.968,
      daily_manufacture_efficiency: 8.5,
      daily_power_efficiency: 3.2,
    },
    domains: [{
      id: "manufacture",
      label: "制造站",
      current: {
        operators: ["阿米娅"],
        final_efficiency: 1.55,
        mechanic_equivalent_efficiency: 1.42,
      },
      baseline: {
        operators: ["基准组合"],
        final_efficiency: 1.4,
        mechanic_equivalent_efficiency: 1.31,
      },
      gap_ratio: 0.107,
      severity: "ok",
    }],
    actions: [{
      priority: "中",
      kind: "promote_tier_up",
      operator: "阿米娅",
      domain_id: "manufacture",
      message: "提升精英阶段以补齐制造轮换。",
      current_elite: 1,
      tier_up_requirement: "精2",
    }],
  },
});

const fourShiftPlanData = rotationResultData({
  rotationProfile: "fiammetta_8_8_4_4",
  durations: [8, 8, 4, 4],
});

const scheduleVisualPlanData = {
  ...planData,
  maa: {
    ...planData.maa,
    plans: [0, 1, 2].map((index) => ({
      ...maaPlan(index),
      rooms: {
        trading: [{
          product: "LMD",
          operators: ["阿米娅", "凯尔希", "贝洛内"],
          sort: true,
          autofill: false,
        }],
        processing: [{ operators: ["阿米娅"] }],
      },
    })),
  },
};

const productChangePlanData = {
  ...scheduleVisualPlanData,
  maa: {
    ...scheduleVisualPlanData.maa,
    plans: scheduleVisualPlanData.maa.plans.map((plan) => ({
      ...plan,
      rooms: {
        ...plan.rooms,
        trading: [0, 1].map(() => ({ product: "LMD", operators: [], sort: true, autofill: false })),
        manufacture: [0, 1, 2, 3].map(() => ({ product: "Gold", operators: [], sort: true, autofill: false })),
      },
    })),
  },
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

const authenticatedSklandSnapshot = {
  player: {
    uid: "123456789",
    nickname: "测试博士",
    level: 120,
    channelName: "官服",
    avatarUrl: null,
    registerTs: 1_600_000_000,
    mainStageProgress: "14-21",
    resume: "为了更好的明天。",
    subscriptionEnd: 1_800_000_000,
    storeTs: 1_700_000_090,
    lastOnlineTs: 1_700_000_080,
    sanity: { current: 120, max: 135, completeRecoveryTime: 1_700_010_000 },
    secretary: { id: "char_002_amiya", name: "阿米娅", skinName: "见习联结者" },
    counts: { operators: 2, furniture: 200, skins: 1 },
  },
  roles: [
    { uid: "123456789", nickname: "测试博士", channelName: "官服", isDefault: true },
    { uid: "987654321", nickname: "测试博士二号", channelName: "B服", isDefault: false },
  ],
  operbox: [
    { id: "char_002_amiya", name: "阿米娅", elite: 2, level: 80, own: true, potential: 6, rarity: 5 },
    { id: "char_003_kalts", name: "凯尔希", elite: 2, level: 90, own: true, potential: 1, rarity: 6 },
  ],
  infrastructure: {
    currentTs: 1_700_000_100,
    storeTs: 1_700_000_090,
    layoutLabel: "243",
    layoutSuggestion: layout243,
    layoutWarning: null,
    tiredOperators: ["阿米娅"],
    labor: { value: 235, maxValue: 235, remainSecs: 0, lastUpdateTime: 1_700_000_000 },
    furnitureTotal: 200,
    training: {
      trainee: "凯尔希",
      trainer: "阿米娅",
      skillIndex: 2,
      remainSecs: 3_600,
      remainPoint: 100,
      speed: 1.2,
      completeWorkTime: 1_700_003_700,
    },
    rooms: [
      {
        key: "control",
        group: "control",
        index: 0,
        level: 5,
        operators: [{ id: "char_002_amiya", name: "阿米娅", morale: 18, workTime: 7_200, lastMoraleUpdateTs: 1_700_000_050 }],
      },
      {
        key: "trade-0",
        group: "trading",
        index: 0,
        level: 3,
        product: "gold",
        operators: [],
        production: { stock: 10, capacity: 10, unitCapacity: null, completed: null, remaining: null, completeWorkTime: 1_700_001_200 },
        orders: [{ delivery: [{ type: "material", count: 3 }], reward: { type: "lmd", count: 1_500 } }],
        lastUpdateTime: 1_700_000_000,
      },
      {
        key: "factory-0",
        group: "manufacture",
        index: 0,
        level: 3,
        product: "battle_record",
        operators: [],
        production: { stock: 2, capacity: 10, unitCapacity: 78, completed: 2, remaining: 8, completeWorkTime: 1_700_001_000 },
        speed: 1.5,
        lastUpdateTime: 1_700_000_000,
      },
      {
        key: "dorm-0",
        group: "dormitory",
        index: 0,
        level: 5,
        operators: [
          { id: "char_003_kalts", name: "凯尔希", morale: 24, workTime: 0, lastMoraleUpdateTs: 1_700_000_050 },
          { id: "char_002_amiya", name: "阿米娅", morale: 18, workTime: 0, lastMoraleUpdateTs: 1_700_000_050 },
        ],
        comfort: 5_000,
      },
      {
        key: "meeting",
        group: "meeting",
        index: 0,
        level: 3,
        operators: [],
        clue: {
          board: ["莱茵生命", "罗德岛"],
          own: 4,
          received: 1,
          dailyReward: true,
          needReceive: 2,
          sharing: true,
          shareCompleteTime: 1_700_005_000,
        },
        completeWorkTime: 1_700_003_000,
        lastUpdateTime: 1_700_000_000,
      },
      {
        key: "hire",
        group: "hire",
        index: 0,
        level: 3,
        operators: [],
        refreshCount: 2,
        completeWorkTime: 1_700_002_000,
      },
    ],
  },
  operators: [
    {
      id: "char_003_kalts",
      name: "凯尔希",
      rarity: 6,
      profession: "MEDIC",
      subProfessionName: "医师",
      elite: 2,
      level: 90,
      potential: 1,
      favorPercent: 200,
      mainSkillLevel: 7,
      skills: [{ index: 1, specializeLevel: 3 }, { index: 2, specializeLevel: 1 }],
      modules: [{ id: "uniequip_1", name: "医者意志", level: 3, locked: false, isDefault: true }],
      currentSkinName: "残余",
      acquiredAt: 1_650_000_000,
      isAssist: true,
    },
    {
      id: "char_002_amiya",
      name: "阿米娅",
      rarity: 5,
      profession: "CASTER",
      subProfessionName: "中坚术师",
      elite: 2,
      level: 80,
      potential: 6,
      favorPercent: 200,
      mainSkillLevel: 7,
      skills: [{ index: 1, specializeLevel: 3 }],
      modules: [],
      currentSkinName: "见习联结者",
      acquiredAt: 1_600_000_000,
      isAssist: false,
    },
  ],
  skins: [{
    id: "skin_amiya",
    name: "见习联结者",
    brandId: "EPOQUE",
    operatorId: "char_002_amiya",
    operatorName: "阿米娅",
    obtainedAt: 1_660_000_000,
    isCurrent: true,
  }],
  progress: {
    recruit: [{ index: 0, startTs: 1_699_990_000, finishTs: 1_700_000_050, state: "completed" }],
    routine: { daily: { current: 8, total: 10 }, weekly: { current: 80, total: 100 } },
    campaign: {
      records: [{ name: "切尔诺伯格", zoneName: "乌萨斯", maxKills: 400 }],
      reward: { current: 1_800, total: 1_800 },
    },
    tower: {
      records: [{ name: "钢铁萝卜矿场", subName: "测试周期", best: 8 }],
      reward: {
        higher: { current: 1, total: 2 },
        lower: { current: 3, total: 4 },
        termTs: 1_800_000_000,
      },
    },
    rogue: [{ name: "傀影与猩红孤钻", relicCount: 120, bankCurrent: 300, bankRecord: 500 }],
    activities: [{
      name: "测试活动",
      startTime: 1_700_000_000,
      endTime: 1_800_000_000,
      rewardEndTime: 1_800_100_000,
      isReplicate: false,
      clearedStages: 8,
      totalStages: 10,
    }],
    bossRush: [{ played: true, stageCode: "TN-1", stageName: "测试关卡", difficulty: "NORMAL" }],
  },
  sourceName: "森空岛同步",
  warnings: [],
};

function mockInfrastructureOperators(prefix: string, count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `${prefix}-${index}`,
    name: `${prefix}-${index + 1}`,
    morale: 24 - index,
    workTime: 7_200 + index * 300,
    lastMoraleUpdateTs: 1_700_000_050,
  }));
}

const productionHeavySklandSnapshot = {
  ...authenticatedSklandSnapshot,
  infrastructure: {
    ...authenticatedSklandSnapshot.infrastructure,
    rooms: [
      {
        ...authenticatedSklandSnapshot.infrastructure.rooms[0],
        operators: mockInfrastructureOperators("control", 5),
      },
      ...Array.from({ length: 2 }, (_, index) => ({
        ...authenticatedSklandSnapshot.infrastructure.rooms[1],
        key: `trade-${index}`,
        index,
        operators: mockInfrastructureOperators(`trade-${index}`, 3),
      })),
      ...Array.from({ length: 4 }, (_, index) => ({
        ...authenticatedSklandSnapshot.infrastructure.rooms[2],
        key: `factory-${index}`,
        index,
        operators: mockInfrastructureOperators(`factory-${index}`, 3),
      })),
      ...Array.from({ length: 3 }, (_, index) => ({
        key: `power-${index}`,
        group: "power",
        index,
        level: 3,
        operators: mockInfrastructureOperators(`power-${index}`, 1),
      })),
      authenticatedSklandSnapshot.infrastructure.rooms[4],
      authenticatedSklandSnapshot.infrastructure.rooms[5],
      ...Array.from({ length: 4 }, (_, index) => ({
        ...authenticatedSklandSnapshot.infrastructure.rooms[3],
        key: `dorm-${index}`,
        index,
        operators: mockInfrastructureOperators(`dorm-${index}`, 5),
      })),
    ],
  },
};

const primarySklandAccount = {
  accountId: "account_primary",
  selectedUid: authenticatedSklandSnapshot.player.uid,
  roles: authenticatedSklandSnapshot.roles,
};

async function mockApis(
  page: Page,
  options: {
    debugTools?: boolean;
    sklandConfigured?: boolean;
    sklandSnapshot?: typeof authenticatedSklandSnapshot;
    sklandAccounts?: typeof primarySklandAccount[];
    activeAccountId?: string | null;
    sklandSessionDelayMs?: number;
  } = {}
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
  await page.route("**/api/skland/session", async (route) => {
    if (options.sklandSessionDelayMs) {
      await new Promise((resolve) => setTimeout(resolve, options.sklandSessionDelayMs));
    }
    const isLogout = route.request().method() === "DELETE";
    const accounts = options.sklandAccounts
      ?? (options.sklandSnapshot ? [{
        ...primarySklandAccount,
        selectedUid: options.sklandSnapshot.player.uid,
        roles: options.sklandSnapshot.roles,
      }] : []);
    const activeAccountId = options.activeAccountId
      ?? (accounts.length ? accounts[0].accountId : null);
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "X-Request-Id": requestId },
      body: JSON.stringify({
        success: true,
        data: isLogout
          ? {
              authenticated: false,
              configured: Boolean(options.sklandConfigured),
              authMethods: { qr: true },
              accounts: [],
              activeAccountId: null,
            }
          : {
              authenticated: Boolean(options.sklandSnapshot),
              configured: Boolean(options.sklandConfigured),
              authMethods: { qr: true },
              accounts,
              activeAccountId,
              disabledReason: options.sklandConfigured
                ? null
                : "当前未开放森空岛登录，可使用 MAA 导入。",
              ...(options.sklandSnapshot ? { snapshot: options.sklandSnapshot } : {}),
            },
        requestId,
      }),
    });
  });
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

async function seedV4Session(
  page: Page,
  seededResult: unknown = planData,
  options: {
    activeShift?: number;
    rotationProfile?: string;
    layoutDirty?: boolean;
    operbox?: Array<Record<string, unknown>>;
  } = {}
) {
  await page.addInitScript(({ layout, result, savedAt, expiresAt, activeShift, rotationProfile, layoutDirty, operbox }) => {
    window.localStorage.setItem("arknights-infra-calc-beta-onboarding-v1", "1");
    if (!window.localStorage.getItem("arknights-infra-calc-session-v4")) window.localStorage.setItem("arknights-infra-calc-session-v4", JSON.stringify({
      version: 4,
      savedAt,
      expiresAt,
      presetLabel: "243",
      layout,
      operbox: operbox ?? [{
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
      layoutDirty,
      rotationProfile,
      result,
      activeShift,
    }));
  }, {
    layout: layout243,
    result: seededResult,
    savedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + 30 * 24 * 60 * 60 * 1000).toISOString(),
    activeShift: options.activeShift ?? 0,
    rotationProfile: options.rotationProfile ?? "abc_12_6_6",
    layoutDirty: options.layoutDirty ?? false,
    operbox: options.operbox,
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
  await expect(page.getByText("排班已生成")).toBeVisible();
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

test("two-shift output drives labels, teams, metric units, and profile details", async ({ page }) => {
  await mockApis(page);
  await seedV4Session(page, twoShiftPlanData, { rotationProfile: "main_backup_12_12" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  const shiftTabs = page.getByRole("tab", { name: /第 \d 班 · 12h/ });
  await expect(shiftTabs).toHaveCount(2);
  await expect(page.locator("[data-shift-tabs]")).toHaveCSS("overflow-y", "hidden");
  await expect(page.getByRole("tab", { name: /第 3 班/ })).toHaveCount(0);
  await expect(page.getByText("主力 上班 · 替补 休息", { exact: true })).toBeVisible();

  await expect(page.getByText("5.288×", { exact: true })).toBeVisible();
  await expect(page.getByText("24h 贸易", { exact: true }).locator("..")).toContainText(/参考 4\.968×\s*· \+6\.4%/);
  await expect(page.getByText("917.5%", { exact: true })).toBeVisible();
  await expect(page.getByText("24h 制造", { exact: true }).locator("..")).toContainText(/参考 850%\s*· \+7\.9%/);
  await expect(page.getByText("355.2%", { exact: true })).toBeVisible();

  await page.getByRole("tab", { name: /第 2 班 · 12h/ }).click();
  await expect(page.getByText("替补 上班 · 主力 休息", { exact: true })).toBeVisible();

  await page.locator("details").filter({ hasText: "效率详情" }).locator("summary").click();
  await expect(page.getByText("机制等效 当前 1.42 · 参考 1.31", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "练卡建议" }).click();
  await expect(page.getByText("练度提升", { exact: true })).toBeVisible();
  await expect(page.getByText("当前 精1 → 目标 精2", { exact: true })).toBeVisible();
});

test("old sessions normalize duplicate operator names before training advice renders", async ({ page }) => {
  await mockApis(page);
  await seedV4Session(page, planData, {
    operbox: [
      { id: "char_amiya_guard", name: "阿米娅", elite: 1, level: 70, own: true, potential: 6, rarity: 5 },
      { id: "char_002_amiya", name: "阿米娅", elite: 2, level: 80, own: true, potential: 6, rarity: 5 },
    ],
  });
  await page.goto("/");

  await page.getByRole("button", { name: "练卡建议" }).click();
  await expect(page.getByText(/干员名称重复：阿米娅/)).toHaveCount(0);
  await expect.poll(async () => page.evaluate(() => JSON.parse(
    window.localStorage.getItem("arknights-infra-calc-session-v4") ?? "{}"
  ).operbox)).toEqual([
    { id: "char_002_amiya", name: "阿米娅", elite: 2, level: 80, own: true, potential: 6, rarity: 5 },
  ]);
});

test("four-shift output persists the fourth tab and migrates an old v4 profile", async ({ page }) => {
  const legacyResult = structuredClone(fourShiftPlanData);
  delete (legacyResult.profile as { rotation_profile?: string }).rotation_profile;
  delete (legacyResult.rotation as { profile?: string }).profile;

  await mockApis(page);
  await seedV4Session(page, legacyResult, {
    activeShift: 0,
    rotationProfile: "fiammetta_8_8_4_4",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  const fourthShift = page.getByRole("tab", { name: /第 4 班 · 4h/ });
  await expect(page.getByRole("tab", { name: /第 \d 班 · (?:8|4)h/ })).toHaveCount(4);
  await fourthShift.click();
  await expect(fourthShift).toHaveAttribute("aria-selected", "true");
  await expect.poll(async () => page.evaluate(() => JSON.parse(
    window.localStorage.getItem("arknights-infra-calc-session-v4") ?? "{}"
  ).activeShift)).toBe(3);

  await page.reload();
  await expect(page.getByRole("tab", { name: /第 4 班 · 4h/ })).toHaveAttribute("aria-selected", "true");
  const persisted = await page.evaluate(() => JSON.parse(
    window.localStorage.getItem("arknights-infra-calc-session-v4") ?? "{}"
  ));
  expect(persisted.activeShift).toBe(3);
  expect(persisted.result.rotation.profile).toBe("fiammetta_8_8_4_4");
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
  await page.getByRole("tab", { name: "列表式布局" }).click();
  await expect(page.getByText("调试输出")).toBeVisible();
  await expect(page.getByText("问题上下文")).toBeVisible();
});

test("Full E2 stays in place and completes generation, shifts, MAA export, and feedback", async ({ page }) => {
  await mockApis(page);
  await seedPreferences(page);
  await page.goto("/");
  await expect(page.getByText("排班服务已就绪")).toBeVisible();

  const fullE2 = page.getByRole("button", { name: "全角色导入" });
  await expect(fullE2).toBeVisible();
  await fullE2.click();
  await expect(page.getByText("先导入干员数据")).toHaveCount(0);
  await page.getByRole("tab", { name: "列表式布局" }).click();

  const productControlLayouts = await Promise.all([
    page.getByRole("group", { name: /贸易站 1 订单/ }).first(),
    page.getByRole("group", { name: /制造站 1 配方/ }).first(),
  ].map(async (controls) => {
    await expect(controls).toBeVisible();
    return controls.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        columns: style.gridTemplateColumns,
        columnGap: style.columnGap,
        rowGap: style.rowGap,
      };
    });
  }));
  expect(productControlLayouts).toEqual([
    { columns: "90px 90px", columnGap: "8px", rowGap: "10px" },
    { columns: "90px 90px", columnGap: "8px", rowGap: "10px" },
  ]);

  await page.getByRole("button", { name: "生成排班" }).click();
  await expect(page.getByText("排班已生成")).toBeVisible();
  const secondShift = page.getByRole("tab", { name: /第 2 班 · 6h/ });
  await secondShift.click();
  await expect(secondShift).toHaveAttribute("aria-selected", "true");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出到 MAA" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("arknights-infra-schedule-maa.json");

  await page.getByRole("button", { name: "加工站 反馈排班问题" }).click();
  const feedbackDialog = page.getByRole("dialog");
  await expect(feedbackDialog).toHaveClass(/dialog-acrylic/);
  const feedbackFooter = feedbackDialog.locator('[data-slot="dialog-footer"]');
  await expect(feedbackFooter).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(feedbackFooter).toHaveCSS("border-top-width", "0px");
  await expect(feedbackFooter).toHaveCSS("box-shadow", "none");
  await page.getByPlaceholder(/这组应该换成/).fill("加工站排班与预期不一致");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "提交反馈" }).click();
  await expect(page.getByText("反馈已提交，编号：feedback-001")).toBeVisible();
});

test("scheduled product changes require destructive confirmation and rerun with the updated layout", async ({ page }) => {
  await mockApis(page);
  let planRequests = 0;
  let rerunPayload: Record<string, unknown> | null = null;
  let releaseRerun: (() => void) | undefined;
  const rerunGate = new Promise<void>((resolve) => {
    releaseRerun = resolve;
  });
  await page.route("**/api/plan", async (route) => {
    planRequests += 1;
    if (planRequests === 2) {
      rerunPayload = route.request().postDataJSON() as Record<string, unknown>;
      await rerunGate;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: productChangePlanData, requestId }),
    });
  });
  await seedPreferences(page);
  await page.setViewportSize({ width: 1088, height: 900 });
  await page.goto("/");

  await page.getByRole("button", { name: "全角色导入" }).click();
  await page.getByRole("button", { name: "生成排班" }).click();
  await expect(page.getByText("排班已生成")).toBeVisible();
  await expect.poll(() => planRequests).toBe(1);
  await page.getByRole("tab", { name: "列表式布局" }).click();

  const factoryControls = page.getByRole("group", { name: "制造站 1 配方" });
  await factoryControls.getByRole("button", { name: "作战记录" }).click();
  const confirmation = page.getByRole("alertdialog");
  await expect(confirmation).toBeVisible();
  await expect(confirmation.getByRole("heading", { name: "更改配置并重新排班？" })).toBeVisible();
  await expect(confirmation).toContainText("制造站 1 的制造配方将切换为「作战记录」");
  const confirmationFooter = confirmation.locator('[data-slot="dialog-footer"]');
  await expect(confirmationFooter).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(confirmationFooter).toHaveCSS("border-top-width", "0px");
  await expect(confirmationFooter).toHaveCSS("box-shadow", "none");
  await expect(confirmation.getByRole("button", { name: "确认并重新排班" })).toHaveClass(/text-destructive/);
  await confirmation.getByRole("button", { name: "取消" }).click();
  await expect(confirmation).toBeHidden();
  expect(planRequests).toBe(1);
  await expect(factoryControls.getByRole("button", { name: "贵金属" })).toHaveAttribute("aria-pressed", "true");

  const tradeControls = page.getByRole("group", { name: "贸易站 1 订单" });
  await tradeControls.getByRole("button", { name: "开采协力" }).click();
  await expect(confirmation).toContainText("贸易站 1 的贸易策略将切换为「开采协力」");
  await confirmation.getByRole("button", { name: "确认并重新排班" }).click();
  await expect.poll(() => planRequests).toBe(2);
  await expect(confirmation).toHaveAttribute("aria-busy", "true");
  await expect(confirmation.getByRole("button", { name: "重新排班中" })).toBeDisabled();

  const rerunLayout = rerunPayload?.layout as { rooms?: Array<{ id?: string; product?: { trade?: { order?: string } } }> } | undefined;
  expect(rerunLayout?.rooms?.find((room) => room.id === "trade_1")?.product?.trade?.order).toBe("originium");
  releaseRerun?.();
  await expect(confirmation).toBeHidden();
  await expect(page.getByText("排班已生成")).toBeVisible();
  await expect(tradeControls.getByRole("button", { name: "开采协力" })).toHaveAttribute("aria-pressed", "true");
});

test("responsive navigation and the two locked areas keep their current behavior", async ({ page }) => {
  await mockApis(page);
  await seedV4Session(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  const listViewTab = page.getByRole("tab", { name: "列表式布局" });
  const compactViewTab = page.getByRole("tab", { name: "一图流布局" });
  await expect(compactViewTab).toBeVisible();
  await expect(compactViewTab).toBeDisabled();
  await expect(listViewTab).toHaveAttribute("aria-selected", "true");
  await expect(compactViewTab.locator("xpath=..").getByRole("tab")).toHaveText(["一图流布局", "列表式布局"]);
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
    await expect(page.getByRole("button", { name: "全角色导入" })).toBeVisible();
    await expect(compactViewTab).toBeEnabled();
    await expect(compactViewTab).toHaveAttribute("aria-selected", "true");
  }

  await expect(page.getByRole("button", { name: "基建计算器" })).toBeVisible();
  await expect(page.getByRole("button", { name: "练卡建议" })).toBeVisible();
  await expect(page.getByRole("button", { name: "森空岛状态", exact: true })).toBeVisible();
});

test("the top account bar stays pinned on every page and treats local Box data as logged out", async ({ page }) => {
  await mockApis(page, { sklandSessionDelayMs: 12_000 });
  await seedV4Session(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  const topbar = page.locator("[data-app-topbar]");
  await expect(topbar).toBeVisible({ timeout: 15_000 });
  const topbarStyle = await topbar.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      backgroundColor: style.backgroundColor,
      borderBottomWidth: style.borderBottomWidth,
      boxShadow: style.boxShadow,
    };
  });
  expect(topbarStyle.backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
  expect(topbarStyle.borderBottomWidth).toBe("1px");
  expect(topbarStyle.boxShadow).toBe("none");
  await expect(page.locator("[data-skland-topbar-loading]")).toBeVisible();
  await expect(topbar.getByRole("button", { name: "登录森空岛" })).toBeVisible({ timeout: 15_000 });
  await expect(page.locator("[data-skland-sidebar-account]")).toHaveCount(0);

  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect.poll(async () => (await topbar.boundingBox())?.y ?? -1).toBeCloseTo(0, 0);

  for (const destination of ["练卡建议", "森空岛状态", "基建计算器"]) {
    await topbar.getByRole("button", { name: "Toggle Sidebar" }).click();
    await page.getByRole("button", { name: destination, exact: true }).click();
    await expect(topbar.getByRole("button", { name: "登录森空岛" })).toBeVisible();
  }

  await page.setViewportSize({ width: 768, height: 900 });
  await expect.poll(() => topbar.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      backgroundColor: style.backgroundColor,
      borderBottomWidth: style.borderBottomWidth,
    };
  })).toEqual({
    backgroundColor: "rgba(0, 0, 0, 0)",
    borderBottomWidth: "0px",
  });
});

test("mobile interactive targets remain at least 44 CSS pixels", async ({ page }) => {
  await mockApis(page);
  await seedV4Session(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  const undersized = await page.locator('button:not(:disabled), a[href], input:not([type="hidden"]), [role="tab"]:not([aria-disabled="true"])').evaluateAll((elements) => (
    elements.flatMap((element) => {
      if (element.getAttribute("aria-label") === "Open Next.js Dev Tools") return [];
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      if (style.visibility === "hidden" || style.display === "none" || rect.width === 0 || rect.height === 0) return [];
      if (rect.width >= 44 && rect.height >= 44) return [];
      return [{
        name: element.getAttribute("aria-label") || element.textContent?.trim() || element.tagName,
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      }];
    })
  ));
  expect(undersized).toEqual([]);
});

test("an empty generated profile explains that no training action is needed", async ({ page }) => {
  await mockApis(page);
  await seedV4Session(page);
  await page.goto("/");
  await page.getByRole("button", { name: "练卡建议" }).click();

  await expect(page.getByRole("heading", { name: "本次排班暂无培养建议" })).toBeVisible();
  await expect(page.getByText("当前干员与布局没有需要优先培养的项目，可以继续使用现有排班。")).toBeVisible();
  await expect(page.getByRole("button", { name: "查看当前排班" })).toBeVisible();
  await expect(page.getByText("先导入干员数据、确认基建布局并生成一次排班。")).toHaveCount(0);
});

test("setup owns Box parse errors and uses technical summary surfaces", async ({ page }) => {
  await mockApis(page, {
    sklandConfigured: true,
    sklandSnapshot: authenticatedSklandSnapshot,
  });
  await seedV4Session(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  const setupTrigger = page.getByRole("button", { name: "配置Box与布局" }).first();
  await setupTrigger.click();
  const dialog = page.getByRole("dialog");
  await page.getByRole("tab", { name: /导入干员数据/ }).click();
  await page.getByRole("tab", { name: "森空岛同步" }).click();
  await expect(dialog.locator(".infra-room-surface")).toHaveCount(2);
  await page.getByRole("tab", { name: "MAA 导入" }).click();
  const [boxContentBox, boxViewportBox] = await Promise.all([
    dialog.locator("[data-setup-box-content]").boundingBox(),
    dialog.locator('[data-slot="scroll-area-viewport"]:visible').boundingBox(),
  ]);
  expect(boxContentBox).not.toBeNull();
  expect(boxViewportBox).not.toBeNull();
  expect(boxContentBox?.width).toBeCloseTo(boxViewportBox?.width ?? 0, 0);
  const textarea = dialog.getByPlaceholder("粘贴 Arknights_OperBox_Export.json 内容");
  await textarea.fill("not valid json");
  await dialog.getByRole("button", { name: "导入粘贴内容" }).click();

  await expect(textarea).toHaveAttribute("aria-invalid", "true");
  await expect(dialog.locator('[role="alert"]')).toHaveCount(1);
  await expect.poll(() => page.locator('[role="alert"]').evaluateAll((elements) => (
    elements.filter((element) => element.textContent?.trim()).length
  ))).toBe(1);
  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(dialog).toBeHidden();
  await expect(setupTrigger).toBeFocused();
});

test("setup exposes and persists only worker-supported rotation profiles", async ({ page }) => {
  await mockApis(page);
  await seedV4Session(page);
  let planRequests = 0;
  let requestedRotation: unknown;
  await page.route("**/api/plan", async (route) => {
    planRequests += 1;
    requestedRotation = (route.request().postDataJSON() as { rotation?: unknown }).rotation;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: planData, requestId }),
    });
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.getByRole("button", { name: "配置Box与布局" }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toHaveClass(/dialog-acrylic/);
  await expect(dialog.locator("[data-setup-top]")).toBeVisible();
  await expect(dialog.getByText("导入干员数据，再确认换班方式与基建设施。修改会立即应用，但不会自动生成排班。")).toHaveCount(0);
  await expect(dialog.locator("[data-setup-footer]")).toBeVisible();
  await expect(dialog.locator("[data-setup-footer]")).toHaveClass(/setup-dialog-footer/);
  await dialog.getByRole("tab", { name: /配置基建/ }).click();

  const selectedPreset = dialog.getByRole("button", { name: /^243/ });
  await expect(selectedPreset).toHaveAttribute("aria-pressed", "true");
  await expect(selectedPreset).toHaveCSS("background-color", "rgb(48, 48, 39)");
  await expect(selectedPreset).toHaveCSS("box-shadow", "none");
  const layoutColumns = dialog.locator("[data-setup-layout-columns]");
  const [stepListBox, layoutFrame] = await Promise.all([
    dialog.locator("[data-setup-step-list]").boundingBox(),
    layoutColumns.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return {
        left: rect.left + Number.parseFloat(style.paddingLeft),
        right: rect.right - Number.parseFloat(style.paddingRight),
      };
    }),
  ]);
  expect(stepListBox).not.toBeNull();
  expect(Math.abs((stepListBox?.x ?? 0) - layoutFrame.left)).toBeLessThanOrEqual(1);
  expect(Math.abs(((stepListBox?.x ?? 0) + (stepListBox?.width ?? 0)) - layoutFrame.right)).toBeLessThanOrEqual(1);
  expect(await layoutColumns.evaluate((element) => getComputedStyle(element).gridTemplateColumns)).toMatch(/^280px 1px /);
  expect(await dialog.locator("[data-setup-layout-divider]").evaluate((element) => element.getBoundingClientRect().width)).toBe(1);
  const [dialogBox, setupScrollbarBox] = await Promise.all([
    dialog.boundingBox(),
    dialog.locator('[data-slot="scroll-area-scrollbar"]:visible').boundingBox(),
  ]);
  expect(dialogBox).not.toBeNull();
  expect(setupScrollbarBox).not.toBeNull();
  expect(Math.abs(
    ((dialogBox?.x ?? 0) + (dialogBox?.width ?? 0))
      - ((setupScrollbarBox?.x ?? 0) + (setupScrollbarBox?.width ?? 0))
  )).toBeLessThanOrEqual(1);
  await expect(dialog.locator('[data-slot="setup-room-card"]')).toHaveCount(18);
  await expect(dialog.locator('[data-slot="setup-room-card"][data-room-group="trading"]')).toHaveCount(2);
  await expect(dialog.locator('[data-slot="setup-room-card"][data-room-group="manufacture"]')).toHaveCount(4);
  await expect(dialog.locator('[data-slot="setup-room-card"][data-room-group="power"]')).toHaveCount(3);
  const activeTradeOrder = dialog.getByRole("group", { name: "trade_1 订单" }).getByRole("button", { name: "龙门商法" });
  const tradeOrderGroup = dialog.getByRole("group", { name: "trade_1 订单" });
  expect(await tradeOrderGroup.evaluate((element) => {
    const style = getComputedStyle(element);
    return { columnGap: style.columnGap, rowGap: style.rowGap };
  })).toEqual({ columnGap: "8px", rowGap: "10px" });
  await expect(dialog.locator('[data-slot="setup-room-card"]').first()).toHaveCSS("box-shadow", "none");
  await expect(activeTradeOrder).toHaveClass(/infra-room-control/);
  await expect(activeTradeOrder).toHaveAttribute("aria-pressed", "true");
  await dialog.getByText("高级设置", { exact: true }).click();

  const rotationTrigger = dialog.getByRole("combobox", { name: "换班方式" });
  await rotationTrigger.click();
  const [triggerBox, popupBox] = await Promise.all([
    rotationTrigger.locator("xpath=..").boundingBox(),
    page.locator('[data-slot="combobox-content"]').boundingBox(),
  ]);
  expect(triggerBox).not.toBeNull();
  expect(popupBox).not.toBeNull();
  expect(Math.abs((triggerBox?.x ?? 0) - (popupBox?.x ?? 0))).toBeLessThanOrEqual(1);
  expect(popupBox?.width).toBeCloseTo(triggerBox?.width ?? 0, 0);
  await expect(dialog.locator('[data-slot="select-trigger"]')).toHaveCount(0);
  await expect(page.getByRole("option", { name: /自动轮换/ })).toHaveCount(0);
  await expect(page.getByRole("option", { name: /一天两换/ })).toHaveCount(0);
  await expect(page.getByRole("option", { name: /自定义/ })).toHaveCount(0);
  await expect(page.getByRole("option")).toHaveCount(4);
  await rotationTrigger.fill("菲亚梅塔");
  await expect(page.getByRole("option")).toHaveCount(1);
  await rotationTrigger.press("Enter");
  await expect(rotationTrigger).toHaveValue("菲亚梅塔轮换 · 8/8/4/4");
  await rotationTrigger.click();
  await expect(page.locator('[data-slot="combobox-content"]')).toBeVisible();
  await rotationTrigger.fill("不存在的方案");
  await expect(page.getByText("没有匹配的换班方式", { exact: true })).toBeVisible();
  await rotationTrigger.press("Escape");
  await expect(rotationTrigger).toHaveValue("菲亚梅塔轮换 · 8/8/4/4");
  await expect(dialog.getByText("完整循环 24 小时")).toBeVisible();
  await expect(dialog.getByText("第 4 班 4h")).toBeVisible();
  await dialog.getByRole("button", { name: "完成设置" }).click();

  await page.getByRole("button", { name: "生成排班" }).click();
  await expect.poll(() => planRequests).toBe(1);
  expect(requestedRotation).toBe("fiammetta_8_8_4_4");
  const persisted = await page.evaluate(() => JSON.parse(
    window.localStorage.getItem("arknights-infra-calc-session-v4") ?? "{}"
  ));
  expect(persisted.rotationProfile).toBe("fiammetta_8_8_4_4");
});

test("layout level controls clamp edits and expose the power-safe 342 defaults", async ({ page }) => {
  await mockApis(page);
  await seedV4Session(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");

  await page.getByRole("button", { name: "配置Box与布局" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("tab", { name: /配置基建/ }).click();
  const activeTradeOrder = dialog.getByRole("group", { name: "trade_1 订单" }).getByRole("button", { name: "龙门商法" });

  const controlLevel = dialog.locator('input[aria-label="control 等级"]:visible');
  await expect(controlLevel).toHaveValue("5");
  await dialog.getByRole("button", { name: "control 等级减一" }).click();
  await expect(controlLevel).toHaveValue("4");
  await controlLevel.fill("999");
  await controlLevel.press("Enter");
  await expect(controlLevel).toHaveValue("5");

  await dialog.getByRole("button", { name: /^342/ }).click();
  await expect(dialog.locator('input[aria-label="trade_2 等级"]:visible')).toHaveValue("2");
  await expect(dialog.locator('input[aria-label="dorm_1 等级"]:visible')).toHaveValue("2");
  await expect(dialog.getByText("发电 540 / 耗电 540", { exact: true })).toBeVisible();

  await page.setViewportSize({ width: 768, height: 900 });
  const mediumOverflow = await dialog.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));
  expect(mediumOverflow.scrollWidth).toBeLessThanOrEqual(mediumOverflow.clientWidth);

  await page.setViewportSize({ width: 390, height: 844 });
  const footerBox = await dialog.locator("[data-setup-footer]").boundingBox();
  expect(footerBox?.height ?? Infinity).toBeLessThanOrEqual(72);
  expect((footerBox?.y ?? Infinity) + (footerBox?.height ?? Infinity)).toBeLessThanOrEqual(844);
  expect(await activeTradeOrder.evaluate((element) => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
  const mobileTradeLevel = dialog.locator('input[aria-label="trade_2 等级"]:visible');
  await mobileTradeLevel.click();
  const firstLevelOption = page.getByRole("option", { name: "1", exact: true });
  const [levelFieldBox, levelPopupBox] = await Promise.all([
    mobileTradeLevel.locator("xpath=..").boundingBox(),
    page.locator('[data-slot="combobox-content"]').boundingBox(),
  ]);
  expect(levelPopupBox?.width).toBeCloseTo(levelFieldBox?.width ?? 0, 0);
  expect(await firstLevelOption.evaluate((element) => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
  await firstLevelOption.click();
  await expect(mobileTradeLevel).toHaveValue("1");
});

test("calculator owns scheduling controls and training advice uses a single technical stream", async ({ page }) => {
  const adviceResult = {
    ...planData,
    profile: {
      ...profile,
      actions: [
        {
          priority: "高",
          kind: "promote",
          operator: "阿米娅",
          domain_id: "manufacture",
          message: "优先完成精英化与技能等级，补齐制造站轮换深度。",
        },
        {
          priority: "中",
          kind: "advice",
          operator: "凯尔希",
          domain_id: "power",
          message: "保留发电站轮换位，避免高心情干员长期空转。",
        },
      ],
    },
  };
  await mockApis(page);
  await seedV4Session(page, adviceResult);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  const calculatorControls = page.locator("[data-calculator-controls]");
  const fullE2 = page.locator("[data-full-e2]");
  const runButton = page.getByRole("button", { name: "生成排班" });
  await expect(calculatorControls).toBeVisible();
  const desktopControlHeights = await Promise.all([
    fullE2.evaluate((element) => element.getBoundingClientRect().height),
    runButton.evaluate((element) => element.getBoundingClientRect().height),
  ]);
  expect(desktopControlHeights[0]).toBe(desktopControlHeights[1]);
  const controlOrder = await calculatorControls.locator("button").allTextContents();
  expect(controlOrder.at(-2)).toContain("全角色导入");
  expect(controlOrder.at(-1)).toContain("生成排班");

  await page.getByRole("button", { name: "练卡建议" }).click();
  await expect(calculatorControls).toHaveCount(0);
  await expect(page.getByText("这里只展示求解器给出的结构化建议", { exact: false })).toHaveCount(0);
  await expect(page.locator('[data-slot="training-summary"]')).toHaveClass(/infra-room-surface/);
  await expect(page.locator('[data-slot="training-data-check"]')).toHaveClass(/infra-room-surface/);
  await expect(page.locator('[data-slot="training-summary"] svg')).toHaveCount(1);
  await expect(page.locator('[data-slot="training-data-check"] svg')).toHaveCount(1);
  await expect(page.locator('[data-slot^="training-"] .infra-room-emblem')).toHaveCount(0);
  const adviceCards = page.locator('[data-slot="training-advice-card"]');
  await expect(adviceCards).toHaveCount(2);
  await expect(adviceCards.locator("svg")).toHaveCount(0);
  const cardBoxes = await adviceCards.evaluateAll((elements) => elements.map((element) => {
    const box = element.getBoundingClientRect();
    return { left: box.left, top: box.top, width: box.width };
  }));
  expect(cardBoxes[0].left).toBeCloseTo(cardBoxes[1].left, 0);
  expect(cardBoxes[0].width).toBeCloseTo(cardBoxes[1].width, 0);
  expect(cardBoxes[1].top).toBeGreaterThan(cardBoxes[0].top);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Toggle Sidebar" }).click();
  await page.getByRole("button", { name: "基建计算器" }).click();
  const mobileHeights = await Promise.all([
    page.locator("[data-full-e2]").evaluate((element) => element.getBoundingClientRect().height),
    page.getByRole("button", { name: "生成排班" }).evaluate((element) => element.getBoundingClientRect().height),
  ]);
  expect(Math.min(...mobileHeights)).toBeGreaterThanOrEqual(44);
});

test("schedule visuals use a stable technical canvas and responsive level markers", async ({ page }) => {
  await mockApis(page);
  await seedV4Session(page, scheduleVisualPlanData);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  const canvas = page.locator("[data-infra-canvas]");
  const roomSurface = page.locator(".infra-room-surface").first();
  const listDiamonds = page.locator('.level-diamonds[data-variant="list"]').first();
  const listViewTab = page.getByRole("tab", { name: "列表式布局" });
  const compactViewTab = page.getByRole("tab", { name: "一图流布局" });

  await expect(canvas).toBeVisible({ timeout: 15_000 });
  await expect(roomSurface).toBeVisible();
  await expect(compactViewTab).toHaveAttribute("aria-selected", "true");
  await listViewTab.click();
  await expect(listDiamonds).toBeVisible();

  const visualStyles = await page.evaluate(() => {
    const room = document.querySelector<HTMLElement>(".infra-room-surface");
    if (!room) throw new Error("Missing room surface");
    const surface = getComputedStyle(room);
    const mesh = getComputedStyle(room, "::before");
    const emblem = room.querySelector<HTMLElement>(".infra-room-emblem");
    if (!emblem) throw new Error("Missing room emblem");
    const emblemStyle = getComputedStyle(emblem);
    return {
      bodyFont: getComputedStyle(document.body).fontFamily,
      backdropFilter: surface.backdropFilter
        || (surface as CSSStyleDeclaration & { webkitBackdropFilter?: string }).webkitBackdropFilter,
      surfaceBackground: surface.backgroundColor,
      meshMask: mesh.maskImage || mesh.webkitMaskImage,
      emblemImage: emblemStyle.backgroundImage,
      emblemBackgroundSize: emblemStyle.backgroundSize,
      emblemOpacity: emblemStyle.opacity,
      emblemFilter: emblemStyle.filter,
      emblemBlendMode: emblemStyle.mixBlendMode,
    };
  });
  expect(visualStyles.bodyFont).toContain("Noto Sans SC");
  expect(visualStyles.bodyFont).not.toContain("Segoe UI");
  expect(visualStyles.backdropFilter).toBe("none");
  expect(visualStyles.surfaceBackground).toBe("rgb(39, 42, 43)");
  expect(visualStyles.meshMask).toContain("facility-grid.svg");
  expect(visualStyles.emblemImage).toContain("building-room-emblems/emblem_");
  expect(visualStyles.emblemImage).toContain(".png");
  expect(visualStyles.emblemBackgroundSize).toBe("auto 100%");
  expect(visualStyles.emblemOpacity).toBe("0.16");
  expect(visualStyles.emblemFilter).toBe("none");
  expect(visualStyles.emblemBlendMode).toBe("normal");

  const listBox = await listDiamonds.boundingBox();
  expect(listBox?.height).toBeCloseTo(20, 0);
  const listDiamondBox = await listDiamonds.locator(".level-diamond").first().boundingBox();
  expect(listDiamondBox?.width).toBeCloseTo(10, 0);

  await compactViewTab.click();
  const compactDiamonds = page.locator('.level-diamonds[data-variant="compact"]').first();
  await expect(compactDiamonds).toBeVisible();
  const compactBox = await compactDiamonds.boundingBox();
  expect(compactBox?.height).toBeCloseTo(14, 0);
  const compactDiamondBox = await compactDiamonds.locator(".level-diamond").first().boundingBox();
  expect(compactDiamondBox?.width).toBeCloseTo(7.5, 0);

  await listViewTab.click();
  await page.setViewportSize({ width: 768, height: 900 });
  await expect(compactViewTab).toBeEnabled();
  await expect(listViewTab).toHaveAttribute("aria-selected", "true");
  const tabletOperatorGrid = page.locator(".infra-list-operator-grid").first();
  await expect(tabletOperatorGrid).toBeVisible();
  const tabletGridSize = await tabletOperatorGrid.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));
  expect(tabletGridSize.scrollWidth).toBeLessThanOrEqual(tabletGridSize.clientWidth);
  const tabletTradeRoom = page.locator('[data-room-group="trading"]').first();
  const tabletTradeLayout = await tabletTradeRoom.evaluate((element) => ({
    flexDirection: getComputedStyle(element).flexDirection,
  }));
  expect(tabletTradeLayout.flexDirection).toBe("column");
  const tabletTradeSections = tabletTradeRoom.locator(":scope > div");
  const tabletTradeSummaryBox = await tabletTradeSections.nth(0).boundingBox();
  const tabletTradeOccupancyBox = await tabletTradeSections.nth(1).boundingBox();
  expect(tabletTradeSummaryBox).not.toBeNull();
  expect(tabletTradeOccupancyBox).not.toBeNull();
  expect(tabletTradeOccupancyBox!.y).toBeGreaterThanOrEqual(
    tabletTradeSummaryBox!.y + tabletTradeSummaryBox!.height - 1
  );

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(compactViewTab).toBeDisabled();
  await expect(listViewTab).toHaveAttribute("aria-selected", "true");
  const mobileDiamonds = page.locator('.level-diamonds[data-variant="list"]').first();
  await expect(mobileDiamonds).toBeVisible();
  const mobileBox = await mobileDiamonds.boundingBox();
  expect(mobileBox?.height).toBeCloseTo(16, 0);
  const mobileDiamondBox = await mobileDiamonds.locator(".level-diamond").first().boundingBox();
  expect(mobileDiamondBox?.width).toBeCloseTo(8, 0);
});

test("Skland login shows QR on every viewport and offers a separate mobile app shortcut", async ({ page }) => {
  await mockApis(page, { sklandConfigured: true });
  let qrStartRequests = 0;
  await page.route("**/api/skland/auth/qr", (route) => {
    qrStartRequests += 1;
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: {
          scanId: "scan-login-1",
          scanUrl: "hypergryph://scan_login?scanId=scan-login-1&from=web",
          expiresInSeconds: 600,
        },
        requestId,
      }),
    });
  });
  await page.route("**/api/skland/auth/qr/status", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      success: true,
      data: { status: "waiting" },
      requestId,
    }),
  }));
  await seedPreferences(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page.locator("[data-app-topbar]").getByRole("button", { name: "登录森空岛" })).toBeVisible();
  await expect(page.locator("[data-skland-sidebar-account]")).toHaveCount(0);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.reload();

  const topbarLogin = page.locator("[data-app-topbar]").getByRole("button", { name: "登录森空岛" });
  await expect(topbarLogin).toBeVisible();
  const loginBox = await topbarLogin.boundingBox();
  expect(loginBox?.height).toBeGreaterThanOrEqual(44);
  await topbarLogin.click();
  await expect(page.getByRole("heading", { name: "把当前罗德岛带进排班助手" })).toBeVisible();
  await expect(page.getByText(/手机号|验证码|密码/)).toHaveCount(0);
  expect(qrStartRequests).toBe(0);
  const [mobileQrBox, mobileCopyBox] = await Promise.all([
    page.locator("[data-skland-login-qr]").boundingBox(),
    page.locator("[data-skland-login-copy]").boundingBox(),
  ]);
  expect(mobileQrBox?.y).toBeLessThan(mobileCopyBox?.y ?? 0);

  await page.getByRole("button", { name: "生成二维码" }).click();
  await expect(page.getByRole("img", { name: "森空岛登录二维码" })).toBeVisible();
  await expect(page.getByRole("button", { name: "打开森空岛 App" })).toHaveAttribute(
    "href",
    "https://bbs.hycdn.cn/u-link/download.html?schema=skland%3A%2F%2FgameCenter"
  );
  await expect(page.getByText("请用森空岛扫描上方二维码", { exact: false })).toBeVisible();

  await page.setViewportSize({ width: 1024, height: 800 });
  await expect(page.getByRole("img", { name: "森空岛登录二维码" })).toBeVisible();
  await expect(page.getByRole("button", { name: "打开森空岛 App" })).toBeHidden();
  await expect(page.locator("[data-skland-login-panel]")).toHaveCSS("border-radius", "0px");
  await expect(page.locator("[data-skland-login-copy]")).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(page.getByRole("link", { name: "skland-kit" })).toHaveAttribute(
    "href",
    "https://github.com/AEtherside/skland-kit"
  );
  const [contentTrackBox, loginPanelBox] = await Promise.all([
    page.locator(".app-content-track").last().evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      const paddingInlineStart = Number.parseFloat(style.paddingInlineStart);
      const paddingInlineEnd = Number.parseFloat(style.paddingInlineEnd);
      return {
        x: rect.x + paddingInlineStart,
        width: rect.width - paddingInlineStart - paddingInlineEnd,
      };
    }),
    page.locator("[data-skland-login-panel]").boundingBox(),
  ]);
  expect(loginPanelBox?.x).toBeCloseTo(contentTrackBox?.x ?? 0, 0);
  expect(loginPanelBox?.width).toBeCloseTo(contentTrackBox?.width ?? 0, 0);
  expect(qrStartRequests).toBe(1);
});

test("Skland login waits for an explicit click and explains slow preparation", async ({ page }) => {
  await mockApis(page, { sklandConfigured: true });
  let qrStartRequests = 0;
  let releaseQr: (() => void) | undefined;
  const qrGate = new Promise<void>((resolve) => {
    releaseQr = resolve;
  });
  await page.route("**/api/skland/auth/qr", async (route) => {
    qrStartRequests += 1;
    await qrGate;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: {
          scanId: "scan-login-slow",
          scanUrl: "hypergryph://scan_login?scanId=scan-login-slow",
          expiresInSeconds: 600,
        },
        requestId,
      }),
    });
  });
  await page.route("**/api/skland/auth/qr/status", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      success: true,
      data: { status: "waiting" },
      requestId,
    }),
  }));
  await seedPreferences(page);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");

  await page.getByRole("button", { name: "Toggle Sidebar" }).click();
  await page.getByRole("button", { name: "森空岛状态", exact: true }).click();
  expect(qrStartRequests).toBe(0);
  const generateButton = page.getByRole("button", { name: "生成二维码" });
  await generateButton.click();
  await expect(page.locator("[data-skland-login-qr]").getByRole("status")).toContainText("正在生成二维码…");
  await expect(page.getByText("正在连接登录服务…")).toBeVisible({ timeout: 3_000 });
  expect(qrStartRequests).toBe(1);

  releaseQr?.();
  await expect(page.getByRole("img", { name: "森空岛登录二维码" })).toBeVisible();
  expect(qrStartRequests).toBe(1);
});

test("Skland status center keeps profile and recruitment in overview and supports role switching", async ({ page }) => {
  const switchedSnapshot = {
    ...authenticatedSklandSnapshot,
    player: {
      ...authenticatedSklandSnapshot.player,
      uid: "987654321",
      nickname: "测试博士二号",
    },
    infrastructure: {
      ...authenticatedSklandSnapshot.infrastructure,
      training: null,
    },
    sourceName: "森空岛同步",
  };
  let attendanceRequests = 0;
  page.on("request", (request) => {
    if (/attendance|sign/i.test(request.url())) attendanceRequests += 1;
  });
  await mockApis(page, {
    sklandConfigured: true,
    sklandSnapshot: authenticatedSklandSnapshot,
  });
  await page.route("**/api/skland/role", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    headers: { "X-Request-Id": requestId },
    body: JSON.stringify({
      success: true,
      data: {
        authenticated: true,
        configured: true,
        authMethods: { qr: true },
        accounts: [{
          ...primarySklandAccount,
          selectedUid: switchedSnapshot.player.uid,
          roles: switchedSnapshot.roles,
        }],
        activeAccountId: primarySklandAccount.accountId,
        snapshot: switchedSnapshot,
      },
      requestId,
    }),
  }));
  await seedPreferences(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  const scheduleViewTabHeight = await page.getByRole("tab", { name: "列表式布局" })
    .evaluate((element) => element.getBoundingClientRect().height);
  await page.getByRole("button", { name: "森空岛状态", exact: true }).click();
  await expect(page.locator("[data-calculator-controls]")).toHaveCount(0);

  await expect(page.getByRole("img", { name: "测试博士的森空岛头像" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "测试博士" }).first()).toBeVisible();
  await expect(page.getByText("UID 123••••789")).toBeVisible();
  const accountCombobox = page.getByRole("combobox", { name: "选择账号与角色" });
  await expect(accountCombobox).toHaveValue("测试博士 · 官服");
  await expect(accountCombobox).not.toHaveValue(/123456789/);
  await accountCombobox.click();
  const [accountFieldBox, accountPopupBox] = await Promise.all([
    accountCombobox.locator("xpath=..").boundingBox(),
    page.locator('[data-slot="combobox-content"]').boundingBox(),
  ]);
  expect(accountPopupBox?.width).toBeCloseTo(accountFieldBox?.width ?? 0, 0);
  await accountCombobox.press("Escape");
  await expect(page.locator('[data-slot="select-trigger"]')).toHaveCount(0);
  await expect(page.getByRole("tab", { name: "概览", exact: true })).toBeVisible();
  await expect(page.getByRole("tab", { name: "基建", exact: true })).toBeVisible();
  await expect(page.getByRole("tab", { name: "进度", exact: true })).toHaveCount(0);
  await expect(page.locator("[data-skland-view-tabs]")).toHaveAttribute("data-variant", "default");
  await expect(page.locator("[data-skland-view-tabs] svg")).toHaveCount(0);
  const layoutSync = page.locator('[data-slot="skland-layout-sync"]');
  await expect(layoutSync).toBeVisible();
  await expect(layoutSync).not.toHaveClass(/infra-room-surface/);
  const [viewTabsBox, layoutSyncBox] = await Promise.all([
    page.locator("[data-skland-view-tabs]").boundingBox(),
    layoutSync.boundingBox(),
  ]);
  expect((layoutSyncBox?.x ?? 0)).toBeGreaterThan(viewTabsBox?.x ?? 0);
  const sklandViewTabHeight = await page.getByRole("tab", { name: "概览", exact: true })
    .evaluate((element) => element.getBoundingClientRect().height);
  expect(sklandViewTabHeight).toBe(scheduleViewTabHeight);
  await expect(page.getByRole("tab", { name: "干员", exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "实时数据", exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "基建数据", exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "当前理智", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "无人机", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "日常与周常", exact: true })).toBeVisible();
  await expect(page.locator("[data-skland-metric]")).toHaveCount(0);
  await expect(page.getByText("4 项状态提醒")).toBeVisible();
  await expect(page.getByText("博士档案", { exact: true })).toBeVisible();
  await expect(page.getByText("收藏概况", { exact: true })).toBeVisible();
  const overviewRecruit = page.locator('section[aria-labelledby="overview-recruit-title"]');
  await expect(overviewRecruit.getByRole("heading", { name: "公开招募", exact: true })).toBeVisible();
  await expect(overviewRecruit.getByText("槽位 1")).toBeVisible();

  await page.getByRole("tab", { name: "基建", exact: true }).click();
  await expect(page.getByRole("region", { name: "基建概览", exact: true })).toBeVisible();
  await expect(page.locator('[data-skland-metric="rest"]')).toHaveAttribute("data-metric-tone", "green");
  await expect(page.locator('[data-skland-metric="trading"]')).toHaveAttribute("data-metric-tone", "blue");
  await expect(page.locator('[data-skland-metric="manufacture"]')).toHaveAttribute("data-metric-tone", "amber");
  await expect(page.locator('[data-skland-metric="clue"]')).toHaveAttribute("data-metric-tone", "orange");
  await expect(page.locator('[data-skland-metric] .infra-room-surface')).toHaveCount(4);
  await expect(page.locator('[data-skland-metric] .infra-room-emblem')).toHaveCount(0);
  await expect(page.locator('[data-slot="skland-training-room"]')).toHaveClass(/infra-room-surface/);
  await expect(page.locator('[data-slot="skland-infra-assets"]')).toHaveClass(/infra-room-surface/);
  await expect(page.locator('[data-slot^="skland-"] .infra-room-emblem')).toHaveCount(0);
  await expect(page.locator('[data-slot="skland-layout-sync"] svg').first()).toBeVisible();
  await expect(page.locator('[data-slot="skland-training-room"] svg').first()).toBeVisible();
  await expect(page.locator('[data-slot="skland-infra-assets"] svg').first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "当前基建", exact: true })).toBeVisible();
  await expect(page.getByText("按计算器布局排列，快速核对进驻、心情与生产状态。", { exact: true })).toHaveCount(0);
  await expect(page.locator("[data-skland-compact-layout]")).toBeVisible();
  const compactColumns = page.locator("[data-skland-compact-column]");
  await expect(compactColumns).toHaveCount(2);
  const compactColumnBottoms = await compactColumns.evaluateAll((columns) => columns.map((column) => (
    column.getBoundingClientRect().bottom
  )));
  expect(Math.abs(compactColumnBottoms[0] - compactColumnBottoms[1])).toBeLessThanOrEqual(1);
  const compactLastRoomBottoms = await compactColumns.evaluateAll((columns) => columns.map((column) => {
    const rooms = column.querySelectorAll<HTMLElement>("article[data-room-group]");
    return rooms.item(rooms.length - 1).getBoundingClientRect().bottom;
  }));
  expect(Math.abs(compactLastRoomBottoms[0] - compactLastRoomBottoms[1])).toBeLessThanOrEqual(1);
  const compactRoomEmblem = page.locator("[data-skland-compact-layout] .infra-room-emblem").first();
  await expect(compactRoomEmblem).toBeVisible();
  await expect.poll(() => compactRoomEmblem.evaluate((element) => ({
    backgroundSize: getComputedStyle(element).backgroundSize,
    opacity: getComputedStyle(element).opacity,
  }))).toEqual({ backgroundSize: "auto 100%", opacity: "0.16" });
  await expect(page.getByRole("heading", { name: "控制中枢", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "贸易站 1", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "制造站 1", exact: true })).toBeVisible();
  await expect(page.locator(".infra-room-surface").first()).toBeVisible();
  await expect(page.locator('.level-diamonds[data-variant="compact"]').first()).toBeVisible();
  await expect(page.locator(".infra-operator-slot").first()).toBeVisible();
  await expect(page.getByRole("img", { name: "阿米娅" }).first()).toBeVisible();
  await expect(page.getByText("氛围 5000", { exact: true })).toBeVisible();
  await expect(page.getByText("宿舍氛围 5000", { exact: true })).toHaveCount(0);
  await expect(page.getByText("当前进驻", { exact: true })).toHaveCount(0);
  await expect(page.getByText("设施运行正常", { exact: true })).toHaveCount(0);
  await expect(page.locator("[data-infra-complete-time]").first()).toHaveText(/^\d{4}\.\d{1,2}\.\d{1,2} \d{2}:\d{2}$/);
  const clueStatus = page.locator("p").filter({ hasText: "已有 4 · 待接收 2 · 已接收 1" });
  await expect(clueStatus).toContainText("线索交流至");

  await accountCombobox.click();
  await page.getByRole("option", { name: "测试博士二号 · B服" }).click();
  await expect(page.getByRole("heading", { name: "测试博士二号" }).first()).toBeVisible();
  await expect(page.getByRole("img", { name: "测试博士二号的森空岛头像" })).toBeVisible();
  await expect(page.getByRole("button", { name: "刷新" })).toHaveCount(0);
  const trainingRoom = page.locator('[data-slot="skland-training-room"]');
  await expect(trainingRoom.getByText("当前空闲", { exact: true })).toBeVisible();
  await expect(trainingRoom.getByText("暂无训练任务", { exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "概览", exact: true }).click();
  await expect(page.getByText("训练任务已完成", { exact: true })).toHaveCount(0);

  await expect.poll(async () => page.evaluate(() => JSON.stringify(localStorage))).not.toContain("987654321");
  const persisted = await page.evaluate(() => JSON.stringify(localStorage));
  expect(persisted).not.toContain("为了更好的明天");
  expect(persisted).not.toContain('"progress"');

  for (const viewport of [
    { width: 390, height: 844 },
    { width: 768, height: 900 },
    { width: 1440, height: 1000 },
  ]) {
    await page.setViewportSize(viewport);
    const dimensions = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
  }

  await page.getByRole("button", { name: "退出" }).click();
  await expect(page.getByRole("heading", { name: "把当前罗德岛带进排班助手" })).toBeVisible();
  expect(attendanceRequests).toBe(0);
});

test("Skland layout sync stays beside the tabs and confirms replacement of dirty settings", async ({ page }) => {
  await mockApis(page, {
    sklandConfigured: true,
    sklandSnapshot: authenticatedSklandSnapshot,
  });
  await seedV4Session(page, planData, { layoutDirty: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  await page.getByRole("button", { name: "森空岛状态", exact: true }).click();
  const layoutSync = page.locator('[data-slot="skland-layout-sync"]');
  await expect(layoutSync).toContainText("森空岛布局 243");
  const applyButton = layoutSync.getByRole("button", { name: "应用布局" });
  await expect(applyButton).toBeEnabled();
  await applyButton.click();

  const dialog = page.getByRole("dialog", { name: "覆盖当前布局设置？" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveClass(/dialog-acrylic/);
  await dialog.getByRole("button", { name: "覆盖并应用" }).click();
  await expect(layoutSync.getByRole("button", { name: "已同步" })).toBeDisabled();
});

test("Skland base metrics reuse the existing technical card grid and keyboard tab navigation", async ({ page }) => {
  await mockApis(page, {
    sklandConfigured: true,
    sklandSnapshot: authenticatedSklandSnapshot,
  });
  await seedPreferences(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await page.getByRole("button", { name: "森空岛状态", exact: true }).click();
  await page.getByRole("tab", { name: "基建", exact: true }).click();

  for (const viewport of [
    { width: 390, height: 844 },
    { width: 768, height: 960 },
    { width: 1440, height: 1000 },
  ]) {
    await page.setViewportSize(viewport);
    const buildingCards = page.locator('[data-skland-metric-section="building"] [data-skland-metric]');
    await expect(buildingCards).toHaveCount(4);
    await expect(page.locator("[data-skland-overview-grid] > *")).toHaveCount(6);
    await expect(page.locator("[data-skland-metric-glyph]")).toHaveCount(0);

    const widthState = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - window.innerWidth,
      viewportWidth: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      offenders: Array.from(document.querySelectorAll<HTMLElement>("body *"))
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return { tag: element.tagName, className: element.className, left: rect.left, right: rect.right, width: rect.width };
        })
        .filter((rect) => rect.right > window.innerWidth + 1 || rect.left < -1)
        .slice(0, 8),
    }));
    expect(widthState.overflow, JSON.stringify(widthState)).toBeLessThanOrEqual(1);
  }

  const overviewTab = page.getByRole("tab", { name: "概览", exact: true });
  const infrastructureTab = page.getByRole("tab", { name: "基建", exact: true });
  await expect(page.getByRole("tab", { name: "进度", exact: true })).toHaveCount(0);
  await overviewTab.focus();
  await overviewTab.press("ArrowRight");
  await expect(infrastructureTab).toBeFocused();
  await infrastructureTab.press("ArrowRight");
  await expect(overviewTab).toBeFocused();
});

test("Skland compact layout aligns both column endings when production is taller", async ({ page }) => {
  await mockApis(page, {
    sklandConfigured: true,
    sklandSnapshot: productionHeavySklandSnapshot,
  });
  await seedPreferences(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");

  await page.getByRole("button", { name: "森空岛状态", exact: true }).click();
  await page.getByRole("tab", { name: "基建", exact: true }).click();

  const compactColumns = page.locator("[data-skland-compact-column]");
  await expect(compactColumns).toHaveCount(2);
  await expect.poll(() => compactColumns.nth(1).evaluate((column) => (
    getComputedStyle(column).justifyContent
  ))).toBe("space-between");

  const compactLastRoomBottoms = await compactColumns.evaluateAll((columns) => columns.map((column) => {
    const rooms = column.querySelectorAll<HTMLElement>("article[data-room-group]");
    return rooms.item(rooms.length - 1).getBoundingClientRect().bottom;
  }));
  expect(Math.abs(compactLastRoomBottoms[0] - compactLastRoomBottoms[1])).toBeLessThanOrEqual(1);
});

test("Skland supports adding, switching, and individually logging out multiple accounts", async ({ page }) => {
  const secondarySnapshot = {
    ...authenticatedSklandSnapshot,
    player: {
      ...authenticatedSklandSnapshot.player,
      uid: "246813579",
      nickname: "第二账号博士",
      channelName: "官服",
    },
    roles: [{
      uid: "246813579",
      nickname: "第二账号博士",
      channelName: "官服",
      isDefault: true,
    }],
  };
  const secondaryAccount = {
    accountId: "account_secondary",
    selectedUid: secondarySnapshot.player.uid,
    roles: secondarySnapshot.roles,
  };
  let currentSnapshot = authenticatedSklandSnapshot;
  let currentAccounts = [primarySklandAccount];
  let currentAccountId: string | null = primarySklandAccount.accountId;

  await mockApis(page, {
    sklandConfigured: true,
    sklandSnapshot: authenticatedSklandSnapshot,
  });
  await page.route("**/api/skland/session", async (route) => {
    if (route.request().method() === "DELETE") {
      const body = route.request().postDataJSON() as { accountId?: string } | null;
      currentAccounts = currentAccounts.filter((account) => account.accountId !== body?.accountId);
      if (currentAccounts.length) {
        const nextAccount = currentAccounts[0];
        currentAccountId = nextAccount.accountId;
        currentSnapshot = nextAccount.accountId === secondaryAccount.accountId
          ? secondarySnapshot
          : authenticatedSklandSnapshot;
      } else {
        currentAccountId = null;
      }
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "X-Request-Id": requestId },
      body: JSON.stringify({
        success: true,
        data: {
          authenticated: currentAccounts.length > 0,
          configured: true,
          authMethods: { qr: true },
          accounts: currentAccounts,
          activeAccountId: currentAccountId,
          ...(currentAccounts.length ? { snapshot: currentSnapshot } : {}),
        },
        requestId,
      }),
    });
  });
  await page.route("**/api/skland/auth/qr", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    headers: { "X-Request-Id": requestId },
    body: JSON.stringify({
      success: true,
      data: {
        scanId: "scan-second-account",
        scanUrl: "hypergryph://scan_login?scanId=scan-second-account",
        expiresInSeconds: 600,
      },
      requestId,
    }),
  }));
  await page.route("**/api/skland/auth/qr/status", (route) => {
    currentAccounts = [primarySklandAccount, secondaryAccount];
    currentAccountId = secondaryAccount.accountId;
    currentSnapshot = secondarySnapshot;
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "X-Request-Id": requestId },
      body: JSON.stringify({
        success: true,
        data: {
          status: "authenticated",
          accounts: currentAccounts,
          activeAccountId: currentAccountId,
          snapshot: currentSnapshot,
        },
        requestId,
      }),
    });
  });
  await page.route("**/api/skland/role", async (route) => {
    const body = route.request().postDataJSON() as { accountId: string; uid: string };
    const selectedAccount = currentAccounts.find((account) => account.accountId === body.accountId);
    currentAccountId = body.accountId;
    currentSnapshot = body.accountId === secondaryAccount.accountId
      ? secondarySnapshot
      : {
          ...authenticatedSklandSnapshot,
          player: {
            ...authenticatedSklandSnapshot.player,
            uid: body.uid,
            nickname: selectedAccount?.roles.find((role) => role.uid === body.uid)?.nickname ?? "测试博士",
          },
        };
    currentAccounts = currentAccounts.map((account) => account.accountId === body.accountId
      ? { ...account, selectedUid: body.uid }
      : account);
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "X-Request-Id": requestId },
      body: JSON.stringify({
        success: true,
        data: {
          authenticated: true,
          configured: true,
          accounts: currentAccounts,
          activeAccountId: currentAccountId,
          snapshot: currentSnapshot,
        },
        requestId,
      }),
    });
  });

  await seedPreferences(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await page.getByRole("button", { name: "森空岛状态", exact: true }).click();

  const topbarAccount = page.locator("[data-skland-topbar-account]");
  const topbarAvatar = page.locator("[data-skland-topbar-avatar]");
  const accountSelect = page.locator("[data-skland-account-select]");
  const addAccount = page.locator("[data-skland-add-account]");
  const logout = page.locator("[data-skland-logout]");
  await expect(topbarAccount).toBeVisible();
  await expect(topbarAvatar).toBeVisible();
  const avatarBox = await topbarAvatar.boundingBox();
  const topbarAccountBox = await topbarAccount.boundingBox();
  expect(avatarBox?.width).toBeCloseTo(44, 0);
  expect(topbarAccountBox?.height).toBeCloseTo(44, 0);
  await expect.poll(() => topbarAccount.evaluate((element) => getComputedStyle(element).borderRadius)).not.toBe("9999px");
  const controlHeights = await Promise.all([
    accountSelect.evaluate((element) => element.getBoundingClientRect().height),
    addAccount.evaluate((element) => element.getBoundingClientRect().height),
    logout.evaluate((element) => element.getBoundingClientRect().height),
  ]);
  expect(new Set(controlHeights)).toEqual(new Set([36]));
  await expect(logout).toHaveClass(/text-destructive/);

  await topbarAccount.click();
  await expect(page.getByRole("heading", { name: "测试博士" }).first()).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  const mobileControlHeights = await Promise.all([
    accountSelect.evaluate((element) => element.getBoundingClientRect().height),
    addAccount.evaluate((element) => element.getBoundingClientRect().height),
    logout.evaluate((element) => element.getBoundingClientRect().height),
  ]);
  expect(new Set(mobileControlHeights)).toEqual(new Set([44]));
  await page.setViewportSize({ width: 1440, height: 1000 });

  await addAccount.click();
  const addAccountDialog = page.getByRole("dialog", { name: "添加森空岛账号" });
  await expect(addAccountDialog).toBeVisible();
  await expect(addAccountDialog).toHaveClass(/dialog-acrylic/);
  await page.getByRole("button", { name: "生成登录二维码" }).click();
  await expect(page.getByRole("heading", { name: "第二账号博士" }).first()).toBeVisible({ timeout: 12_000 });

  const accountCombobox = page.getByRole("combobox", { name: "选择账号与角色" });
  await accountCombobox.fill("测试博士");
  await expect(page.getByRole("option", { name: "测试博士 · 官服" })).toBeVisible();
  await expect(page.getByRole("option", { name: "第二账号博士 · 官服" })).toHaveCount(0);
  await expect(page.getByText("森空岛账号 1 · 测试博士", { exact: true })).toBeVisible();
  await expect(page.getByText("森空岛账号 2 · 第二账号博士", { exact: true })).toHaveCount(0);
  await page.getByRole("option", { name: "测试博士 · 官服" }).click();
  await expect(accountCombobox).toHaveValue("测试博士 · 官服");
  await expect(page.getByRole("heading", { name: "测试博士" }).first()).toBeVisible();

  await logout.click();
  await expect(page.getByRole("heading", { name: "第二账号博士" }).first()).toBeVisible();
  await logout.click();
  await expect(page.getByRole("heading", { name: "把当前罗德岛带进排班助手" })).toBeVisible();
  await expect(page.locator("[data-app-topbar]").getByRole("button", { name: "登录森空岛" })).toBeVisible();

  const persisted = await page.evaluate(() => JSON.stringify(localStorage));
  expect(persisted).not.toContain(primarySklandAccount.accountId);
  expect(persisted).not.toContain(secondaryAccount.accountId);
  expect(persisted).not.toContain(secondarySnapshot.player.uid);
});

test("Skland disables adding another account after five accounts", async ({ page }) => {
  const accounts = Array.from({ length: 5 }, (_, index) => ({
    ...primarySklandAccount,
    accountId: `account_limit_${index}`,
  }));
  await mockApis(page, {
    sklandConfigured: true,
    sklandSnapshot: authenticatedSklandSnapshot,
    sklandAccounts: accounts,
    activeAccountId: accounts[0].accountId,
  });
  await seedPreferences(page);
  await page.goto("/");
  await page.getByRole("button", { name: "森空岛状态", exact: true }).click();

  const addAccount = page.locator("[data-skland-add-account]");
  await expect(addAccount).toBeDisabled();
  await expect(addAccount).toHaveAttribute("title", "最多可登录 5 个森空岛账号");
});

test("setup routes Skland account actions to the status center", async ({ page }) => {
  await mockApis(page, {
    sklandConfigured: true,
    sklandSnapshot: authenticatedSklandSnapshot,
  });
  await seedPreferences(page);
  await page.goto("/");

  await page.getByRole("button", { name: "配置Box与布局" }).first().click();
  await page.getByRole("tab", { name: /导入干员数据/ }).click();
  await page.getByRole("tab", { name: "森空岛同步" }).click();
  await expect(page.getByRole("dialog").getByText(/测试博士/).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "前往森空岛状态" })).toBeVisible();
  await expect(page.getByRole("button", { name: "使用当前干员数据" })).toHaveCount(0);
  await page.getByRole("button", { name: "前往森空岛状态" }).click();
  await expect(page.getByRole("heading", { name: "测试博士" }).first()).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
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

  await page.getByRole("button", { name: "配置Box与布局" }).click();
  await page.getByRole("tab", { name: /导入干员数据/ }).click();
  const storageCopy = page.getByText(/会在此浏览器保存 30 天/);
  await storageCopy.scrollIntoViewIfNeeded();
  await expect(storageCopy).toBeVisible();
  await page.getByRole("button", { name: "清除本地数据" }).first().click();
  const clearDialog = page.getByRole("dialog", { name: "清除本地数据？" });
  await expect(clearDialog).toBeVisible();
  await expect(clearDialog).toHaveClass(/dialog-acrylic/);
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
