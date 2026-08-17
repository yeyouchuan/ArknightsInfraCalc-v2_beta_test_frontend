import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { URL } from "node:url";

const repoRoot = new URL("../", import.meta.url);

async function readRepoFile(relativePath) {
  return readFile(new URL(relativePath, repoRoot), "utf8");
}

test("Next.js commands use the default Turbopack bundler", async () => {
  const packageJson = JSON.parse(await readRepoFile("package.json"));
  const playwrightConfig = await readRepoFile("playwright.config.ts");
  const productionPlaywrightConfig = await readRepoFile("playwright.production.config.ts");

  assert.equal(packageJson.scripts.build, "next build");
  assert.doesNotMatch(packageJson.scripts.dev, /--webpack\b/);
  assert.doesNotMatch(playwrightConfig, /--webpack\b/);
  assert.doesNotMatch(productionPlaywrightConfig, /--webpack\b/);
});

test("CI enforces the initial route JavaScript budget after building", async () => {
  const packageJson = JSON.parse(await readRepoFile("package.json"));
  const workflow = await readRepoFile(".github/workflows/frontend-quality.yml");
  const budgetCheck = await readRepoFile("scripts/check-bundle-budget.mjs");

  assert.equal(packageJson.scripts["test:bundle-budget"], "node scripts/check-bundle-budget.mjs");
  assert.match(workflow, /Production build[\s\S]+npm run test:bundle-budget/);
  assert.match(budgetCheck, /MAX_INITIAL_JS_BYTES = 1_100_000/);
  assert.match(budgetCheck, /firstLoadUncompressedJsBytes/);
});

test("production injects the client feature flag at every browser boundary", async () => {
  const nextConfig = await readRepoFile("next.config.ts");
  const app = await readRepoFile("src/App.tsx");
  const sidebar = await readRepoFile("src/components/layout/AppSidebar.tsx");
  const setupDialog = await readRepoFile("src/setup-dialog.tsx");
  const workflow = await readRepoFile(".github/workflows/frontend-quality.yml");

  assert.match(nextConfig, /APP_CLIENT_SKLAND_ENABLED: isSklandFeatureEnabled\(\) \? "1" : "0"/);
  for (const browserBoundary of [app, sidebar, setupDialog]) {
    assert.match(browserBoundary, /process\.env\.APP_CLIENT_SKLAND_ENABLED === "1"/);
  }
  assert.match(workflow, /Production build[\s\S]+APP_DEPLOYMENT_ENV: production/);
});

test("the application entry is split behind an accessible loading boundary", async () => {
  const page = await readRepoFile("src/app/page.tsx");
  const loader = await readRepoFile("src/AppLoader.tsx");

  assert.match(page, /import AppLoader from "@\/AppLoader"/);
  assert.match(loader, /dynamic\(\(\) => import\("@\/App"\)/);
  assert.match(loader, /ssr: false/);
  assert.match(loader, /role="status"/);
});
