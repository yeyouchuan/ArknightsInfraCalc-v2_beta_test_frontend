import assert from "node:assert/strict";
import test from "node:test";

import { buildSklandMobileAuthUrl } from "./skland-auth-url.ts";

test("wraps the official scan URL in the Skland universal link", () => {
  assert.equal(
    buildSklandMobileAuthUrl("hypergryph://scan_login?scanId=abc123&from=web"),
    "https://bbs.hycdn.cn/u-link/download.html?schema=hypergryph%3A%2F%2Fscan_login%3FscanId%3Dabc123%26from%3Dweb"
  );
});

test("accepts a future HTTPS scan URL and rejects unsafe or invalid schemes", () => {
  assert.equal(
    buildSklandMobileAuthUrl("https://as.hypergryph.com/scan/abc123"),
    "https://bbs.hycdn.cn/u-link/download.html?schema=https%3A%2F%2Fas.hypergryph.com%2Fscan%2Fabc123"
  );
  assert.equal(buildSklandMobileAuthUrl("javascript:alert(1)"), null);
  assert.equal(buildSklandMobileAuthUrl("not a URL"), null);
});
