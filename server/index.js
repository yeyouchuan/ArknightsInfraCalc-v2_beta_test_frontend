import express from "express";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const bundledCliRoot = path.join(repoRoot, "bin");
const bundledFixtureRoot = path.join(repoRoot, "fixtures");
const coreRoot = path.resolve(process.env.INFRA_CORE_ROOT || path.join(repoRoot, "..", "ArknightsInfraCalc-v2"));
const storageRoot = path.resolve(process.env.BETA_STORAGE_DIR || path.join(repoRoot, "server", "storage"));
const feedbackRoot = path.resolve(process.env.BETA_FEEDBACK_DIR || path.join(storageRoot, "feedback"));
const cliRunRoot = path.resolve(process.env.BETA_CLI_RUN_DIR || path.join(storageRoot, "cli-runs"));
const port = Number(process.env.BETA_API_PORT || 4174);
const host = process.env.BETA_API_HOST || "0.0.0.0";
const timeoutMs = Number(process.env.BETA_CLI_TIMEOUT_MS || 120_000);
const distRoot = path.join(repoRoot, "dist");

const app = express();
app.use(express.json({ limit: "80mb" }));

function cliCandidates() {
  const platformCliName = process.platform === "win32" ? "infra-cli.exe" : "infra-cli";
  const fallbackCliName = process.platform === "win32" ? "infra-cli" : "infra-cli.exe";
  const candidates = [
    process.env.INFRA_CLI_PATH,
    path.join(bundledCliRoot, platformCliName),
    path.join(repoRoot, platformCliName),
    path.join(bundledCliRoot, fallbackCliName),
    path.join(repoRoot, fallbackCliName),
    path.join(coreRoot, "target", "release", platformCliName),
    path.join(coreRoot, "target", "debug", platformCliName),
    path.join(coreRoot, "target", "release", fallbackCliName),
    path.join(coreRoot, "target", "debug", fallbackCliName),
  ].filter(Boolean);

  return [...new Set(candidates.map((candidate) => path.resolve(candidate)))];
}

function resolveCliPath() {
  const candidates = cliCandidates();
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) {
    throw new Error(`没有找到 infra-cli，已检查：${candidates.join(", ")}`);
  }
  return found;
}

function resolveSampleOperboxPath() {
  const candidates = [
    path.join(bundledFixtureRoot, "operbox_full_e2.json"),
    path.join(bundledFixtureRoot, "243", "operbox_full_e2.json"),
    path.join(coreRoot, "data", "fixtures", "243", "operbox_full_e2.json"),
  ].map((candidate) => path.resolve(candidate));

  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) {
    throw new Error(`没有找到样例 operbox，已检查：${candidates.join(", ")}`);
  }
  return found;
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function assertPlanBody(body) {
  if (!isObject(body) || !isObject(body.layout)) {
    throw new Error("请求缺少 layout 对象。");
  }
  if (!Array.isArray(body.operbox) || body.operbox.length === 0) {
    throw new Error("请求缺少非空 operbox 数组。");
  }
}

function assertFeedbackBody(body) {
  if (!isObject(body) || !isObject(body.issue)) {
    throw new Error("请求缺少 issue 对象。");
  }
  if (!Array.isArray(body.operbox) || body.operbox.length === 0) {
    throw new Error("请求缺少对应的非空 operbox 数组。");
  }
}

function safePathSegment(value) {
  return String(value ?? "")
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
    .replace(/\s+/g, "_")
    .slice(0, 48);
}

function makeStampedDirName(stamp, sourceName, id) {
  return [stamp.replace(/[:.]/g, "-"), safePathSegment(sourceName), id].filter(Boolean).join("_");
}

async function writeJson(filePath, value) {
  await writeFile(filePath, JSON.stringify(value, null, 2), "utf-8");
}

async function readJsonIfExists(filePath) {
  try {
    return JSON.parse(await readFile(filePath, "utf-8"));
  } catch {
    return undefined;
  }
}

class InfraCliServeClient {
  constructor() {
    this.child = null;
    this.cliPath = null;
    this.starting = null;
    this.stdoutBuffer = "";
    this.stderrLog = "";
    this.pending = new Map();
    this.nextId = 1;
    this.restartCount = 0;
  }

  ensureStarted() {
    if (this.child && !this.child.killed) {
      return Promise.resolve();
    }
    if (this.starting) {
      return this.starting;
    }

    this.starting = new Promise((resolve, reject) => {
      let cliPath = "";
      try {
        cliPath = resolveCliPath();
      } catch (error) {
        this.starting = null;
        reject(error);
        return;
      }

      const env = {
        ...process.env,
        ARKNIGHTS_INFRA_DATA_DIR: path.join(coreRoot, "data"),
      };
      const cwd = existsSync(coreRoot) ? coreRoot : repoRoot;
      const child = spawn(cliPath, ["serve"], { cwd, env, windowsHide: true, shell: false });
      let settled = false;

      this.child = child;
      this.cliPath = cliPath;
      this.stdoutBuffer = "";
      this.restartCount += 1;

      const settleOk = () => {
        if (settled) return;
        settled = true;
        this.starting = null;
        resolve();
      };
      const settleError = (error) => {
        if (settled) return;
        settled = true;
        this.starting = null;
        reject(error);
      };

      child.stdout?.on("data", (chunk) => {
        settleOk();
        this.handleStdout(chunk.toString());
      });
      child.stderr?.on("data", (chunk) => {
        const text = chunk.toString();
        this.stderrLog += text;
        settleOk();
      });
      child.on("spawn", settleOk);
      child.on("error", (error) => {
        this.stderrLog += `spawn error: ${error.message}\n`;
        if (this.child === child) {
          this.child = null;
        }
        settleError(error);
        this.rejectPending(`infra-cli serve 启动失败：${error.message}`);
      });
      child.on("close", (code, signal) => {
        this.handleClose(child, code, signal);
      });
    });

    return this.starting;
  }

  send(method, params, options = {}) {
    const id = this.nextId++;
    const request = { id, method, params };
    const line = JSON.stringify(request);
    const key = JSON.stringify(id);
    const requestTimeoutMs = options.timeoutMs ?? timeoutMs;

    return new Promise((resolve, reject) => {
      const pending = {
        key,
        request,
        line,
        resolve,
        reject,
        timeoutMs: requestTimeoutMs,
        timer: null,
        stderrStart: this.stderrLog.length,
        resendCount: 0,
      };
      this.pending.set(key, pending);

      this.ensureStarted()
        .then(() => this.writePending(pending))
        .catch((error) => {
          this.pending.delete(key);
          reject(error);
        });
    });
  }

  ping() {
    return this.send("ping", {}, { timeoutMs: 10_000 });
  }

  writePending(pending) {
    const child = this.child;
    if (!child || !child.stdin || child.stdin.destroyed) {
      throw new Error("infra-cli serve 未运行。");
    }

    if (pending.timer) {
      clearTimeout(pending.timer);
    }
    pending.stderrStart = this.stderrLog.length;
    pending.timer = setTimeout(() => {
      this.pending.delete(pending.key);
      pending.reject(new Error(`infra-cli serve 请求超时（${pending.timeoutMs}ms）。`));
      child.kill();
    }, pending.timeoutMs);

    child.stdin.write(`${pending.line}\n`, "utf-8", (error) => {
      if (!error) return;
      if (pending.timer) {
        clearTimeout(pending.timer);
      }
      this.pending.delete(pending.key);
      pending.reject(error);
    });
  }

  handleStdout(chunk) {
    this.stdoutBuffer += chunk;
    for (;;) {
      const newline = this.stdoutBuffer.indexOf("\n");
      if (newline < 0) return;
      const line = this.stdoutBuffer.slice(0, newline).trim();
      this.stdoutBuffer = this.stdoutBuffer.slice(newline + 1);
      if (line) {
        this.handleStdoutLine(line);
      }
    }
  }

  handleStdoutLine(line) {
    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch {
      this.stderrLog += `invalid stdout line: ${line}\n`;
      return;
    }

    const key = JSON.stringify(parsed.id);
    const pending = this.pending.get(key);
    if (!pending) return;

    if (pending.timer) {
      clearTimeout(pending.timer);
    }
    this.pending.delete(key);
    pending.resolve({
      request: pending.request,
      response: parsed,
      stdout: `${line}\n`,
      stderr: this.stderrLog.slice(pending.stderrStart),
    });
  }

  handleClose(child, code, signal) {
    if (this.child !== child) return;
    this.child = null;
    this.starting = null;
    this.stderrLog += `infra-cli serve exited: code=${code ?? "null"} signal=${signal ?? "null"}\n`;

    const active = [...this.pending.values()];
    if (active.length === 0) return;

    for (const pending of active) {
      if (pending.timer) {
        clearTimeout(pending.timer);
      }
      if (pending.resendCount >= 1) {
        this.pending.delete(pending.key);
        pending.reject(new Error(`infra-cli serve 已退出：code=${code ?? "null"} signal=${signal ?? "null"}`));
      } else {
        pending.resendCount += 1;
      }
    }

    if ([...this.pending.values()].some((pending) => pending.resendCount === 1)) {
      this.resendPending();
    }
  }

  resendPending() {
    this.ensureStarted()
      .then(() => {
        for (const pending of this.pending.values()) {
          this.writePending(pending);
        }
      })
      .catch((error) => {
        this.rejectPending(error instanceof Error ? error.message : String(error));
      });
  }

  rejectPending(message) {
    for (const pending of this.pending.values()) {
      if (pending.timer) {
        clearTimeout(pending.timer);
      }
      pending.reject(new Error(message));
    }
    this.pending.clear();
  }

  info() {
    return {
      cliPath: this.cliPath,
      pid: this.child?.pid ?? null,
      running: Boolean(this.child && !this.child.killed),
      restartCount: this.restartCount,
    };
  }
}

let serveClient;

function getServeClient() {
  if (!serveClient) {
    serveClient = new InfraCliServeClient();
  }
  return serveClient;
}

app.get("/api/health", async (_request, response) => {
  try {
    const candidates = cliCandidates();
    const cliPath = candidates.find((candidate) => existsSync(candidate));
    const samplePath = (() => {
      try {
        return resolveSampleOperboxPath();
      } catch {
        return null;
      }
    })();
    let serve = getServeClient().info();
    let serveError = null;
    if (cliPath) {
      try {
        await getServeClient().ping();
        serve = getServeClient().info();
      } catch (error) {
        serveError = error instanceof Error ? error.message : String(error);
      }
    }
    response.status(200).json({
      ok: true,
      apiReady: true,
      cliReady: Boolean(cliPath) && !serveError,
      cliPath: cliPath ?? null,
      serve,
      serveError,
      candidates,
      coreRoot,
      repoRoot,
      bundledCliRoot,
      samplePath,
      storageRoot,
      feedbackRoot,
      cliRunRoot,
    });
  } catch (error) {
    response.status(200).json({
      ok: true,
      apiReady: true,
      cliReady: false,
      cliPath: null,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

app.get("/api/sample-operbox", async (_request, response) => {
  try {
    const samplePath = resolveSampleOperboxPath();
    const sample = JSON.parse(await readFile(samplePath, "utf-8"));
    response.json({
      success: true,
      sourceName: path.relative(repoRoot, samplePath),
      operbox: sample,
    });
  } catch (error) {
    response.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

app.post("/api/feedback", async (request, response) => {
  const savedAt = new Date().toISOString();

  try {
    assertFeedbackBody(request.body);

    const feedbackId = randomUUID();
    const dirName = makeStampedDirName(savedAt, request.body.sourceName, feedbackId);
    const feedbackDir = path.join(feedbackRoot, dirName);
    const metaPath = path.join(feedbackDir, "meta.json");
    const issuePath = path.join(feedbackDir, "issue.json");
    const operboxPersistPath = path.join(feedbackDir, "operbox.json");
    const debugBundlePath = path.join(feedbackDir, "debug-bundle.json");
    await mkdir(feedbackDir, { recursive: true });

    const meta = {
      feedbackId,
      savedAt,
      sourceName: request.body.sourceName ?? null,
      operboxCount: request.body.operbox.length,
      hasDebugBundle: isObject(request.body.debugBundle),
    };

    await writeJson(metaPath, meta);
    await writeJson(issuePath, request.body.issue);
    await writeJson(operboxPersistPath, request.body.operbox);

    if (isObject(request.body.debugBundle)) {
      await writeJson(debugBundlePath, request.body.debugBundle);
    }

    response.json({
      success: true,
      feedbackId,
      savedAt,
      path: feedbackDir,
      relativePath: path.relative(repoRoot, feedbackDir),
      issuePath,
      operboxPath: operboxPersistPath,
      debugBundlePath: isObject(request.body.debugBundle) ? debugBundlePath : undefined,
      relativeIssuePath: path.relative(repoRoot, issuePath),
      relativeOperboxPath: path.relative(repoRoot, operboxPersistPath),
      relativeDebugBundlePath: isObject(request.body.debugBundle) ? path.relative(repoRoot, debugBundlePath) : undefined,
    });
  } catch (error) {
    response.status(400).json({
      success: false,
      savedAt,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

app.post("/api/plan", async (request, response) => {
  let runDir = "";
  let resultPath = "";
  const startedAt = new Date().toISOString();
  const start = performance.now();

  try {
    assertPlanBody(request.body);

    const cliPath = resolveCliPath();
    const runId = randomUUID();
    runDir = path.join(cliRunRoot, makeStampedDirName(startedAt, request.body.sourceName, runId));
    await mkdir(runDir, { recursive: true });

    const layoutPath = path.join(runDir, "layout.json");
    const operboxPath = path.join(runDir, "operbox.json");
    const profilePath = path.join(runDir, "profile.json");
    const maaPath = path.join(runDir, "maa.json");
    const shiftsDir = path.join(runDir, "shifts");
    const debugBundlePath = path.join(runDir, "debug-bundle.json");
    const stdoutPath = path.join(runDir, "stdout.txt");
    const stderrPath = path.join(runDir, "stderr.txt");
    const commandPath = path.join(runDir, "command.txt");
    const serveRequestPath = path.join(runDir, "serve-request.json");
    const serveRequestLinePath = path.join(runDir, "serve-request.jsonl");
    const serveResponsePath = path.join(runDir, "serve-response.json");
    resultPath = path.join(runDir, "result.json");

    await writeJson(layoutPath, request.body.layout);
    await writeJson(operboxPath, request.body.operbox);

    const planParams = {
      layout: layoutPath,
      operbox: operboxPath,
      profile_out: profilePath,
      maa_out: maaPath,
      output_dir: shiftsDir,
      top: 20,
      maa_title: `${request.body.sourceName ?? "Arknights InfraCalc"} · ${request.body.layout.template ?? "layout"}`,
    };

    const serveResult = await getServeClient().send("plan", planParams);
    const durationMs = Math.round(performance.now() - start);
    const command = `${cliPath} serve < ${path.relative(repoRoot, serveRequestLinePath)}`;
    await writeFile(commandPath, command, "utf-8");
    await writeJson(serveRequestPath, serveResult.request);
    await writeFile(serveRequestLinePath, `${JSON.stringify(serveResult.request)}\n`, "utf-8");
    await writeJson(serveResponsePath, serveResult.response);

    const profileJson = await readJsonIfExists(profilePath);
    const maaJson = await readJsonIfExists(maaPath);
    const rotationJson = profileJson?.rotation
      ? {
          shifts: [],
          daily: {
            trade: profileJson.rotation.daily_trade,
            manu: profileJson.rotation.daily_manu,
            power: profileJson.rotation.daily_power,
          },
        }
      : undefined;
    await writeFile(stdoutPath, serveResult.stdout, "utf-8");
    await writeFile(stderrPath, serveResult.stderr, "utf-8");

    const success = Boolean(serveResult.response?.ok) && Boolean(maaJson) && Boolean(profileJson);
    const debugBundle = {
      version: "beta-test-bundle-v2-serve",
      startedAt,
      durationMs,
      cliPath,
      command,
      exitCode: success ? 0 : null,
      signal: null,
      inputSummary: {
        layoutRooms: request.body.layout.rooms?.length ?? null,
        operboxCount: request.body.operbox.length,
        sourceName: request.body.sourceName ?? null,
      },
      layout: request.body.layout,
      operbox: request.body.operbox,
      profileJson,
      maaJson,
      rotationJson,
      serveRequest: serveResult.request,
      serveResponse: serveResult.response,
      stdout: serveResult.stdout,
      stderr: serveResult.stderr,
      savedFiles: {
        runDir: path.relative(repoRoot, runDir),
        layout: path.relative(repoRoot, layoutPath),
        operbox: path.relative(repoRoot, operboxPath),
        profile: profileJson ? path.relative(repoRoot, profilePath) : undefined,
        maa: path.relative(repoRoot, maaPath),
        shifts: path.relative(repoRoot, shiftsDir),
        debugBundle: path.relative(repoRoot, debugBundlePath),
        stdout: path.relative(repoRoot, stdoutPath),
        stderr: path.relative(repoRoot, stderrPath),
        command: path.relative(repoRoot, commandPath),
        serveRequest: path.relative(repoRoot, serveRequestPath),
        serveRequestLine: path.relative(repoRoot, serveRequestLinePath),
        serveResponse: path.relative(repoRoot, serveResponsePath),
        result: path.relative(repoRoot, resultPath),
      },
    };
    await writeJson(debugBundlePath, debugBundle);

    const resultPayload = {
      success,
      startedAt,
      durationMs,
      cliPath,
      command,
      exitCode: success ? 0 : null,
      signal: null,
      stdout: serveResult.stdout,
      stderr: serveResult.stderr,
      profileJson,
      maaJson,
      rotationJson,
      debugBundle,
      runId,
      runPath: runDir,
      relativeRunPath: path.relative(repoRoot, runDir),
      resultPath,
      relativeResultPath: path.relative(repoRoot, resultPath),
      error: success
        ? undefined
        : [
            !serveResult.response?.ok &&
              `infra-cli serve error: ${serveResult.response?.error?.message ?? "unknown error"}`,
            !profileJson && "profile.json 未生成",
            !maaJson && "maa.json 未生成",
            serveResult.stderr?.slice(0, 1200),
          ].filter(Boolean).join("\n"),
    };
    await writeJson(resultPath, resultPayload);

    response.status(success ? 200 : 500).json(resultPayload);
  } catch (error) {
    const errorPayload = {
      success: false,
      startedAt,
      error: error instanceof Error ? error.message : String(error),
      runPath: runDir || undefined,
      relativeRunPath: runDir ? path.relative(repoRoot, runDir) : undefined,
    };
    if (resultPath) {
      await writeJson(resultPath, errorPayload);
    }
    response.status(400).json(errorPayload);
  }
});

if (existsSync(distRoot)) {
  app.use(express.static(distRoot));
  app.get(/.*/, (_request, response) => {
    response.sendFile(path.join(distRoot, "index.html"));
  });
}

app.listen(port, host, () => {
  console.log(`beta app listening on http://${host}:${port}`);
});
