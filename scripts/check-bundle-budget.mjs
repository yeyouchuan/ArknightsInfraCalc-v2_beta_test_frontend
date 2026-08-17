import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stdout } from "node:process";
import { URL } from "node:url";

const MAX_INITIAL_JS_BYTES = 1_100_000;
const statsUrl = new URL("../.next/diagnostics/route-bundle-stats.json", import.meta.url);
const stats = JSON.parse(await readFile(statsUrl, "utf8"));

assert.ok(Array.isArray(stats), "route bundle stats must be an array; run npm run build first");
const rootRoute = stats.find((entry) => entry?.route === "/");
assert.ok(rootRoute, "route bundle stats do not contain the / route");
assert.ok(
  Number.isFinite(rootRoute.firstLoadUncompressedJsBytes),
  "/ firstLoadUncompressedJsBytes must be a finite number",
);
assert.ok(
  rootRoute.firstLoadUncompressedJsBytes <= MAX_INITIAL_JS_BYTES,
  `/ initial uncompressed JavaScript is ${rootRoute.firstLoadUncompressedJsBytes} bytes, exceeding the ${MAX_INITIAL_JS_BYTES} byte budget`,
);

stdout.write(
  `/ initial bundle budget passed: ${rootRoute.firstLoadUncompressedJsBytes} / ${MAX_INITIAL_JS_BYTES} uncompressed JS bytes\n`,
);
