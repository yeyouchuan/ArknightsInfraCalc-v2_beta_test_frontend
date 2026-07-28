import { createHash } from "node:crypto";

import {
  createClient,
  STORAGE_CREDENTIAL_KEY,
  STORAGE_DID_KEY,
  STORAGE_OAUTH_TOKEN_KEY,
  STORAGE_USER_ID_KEY,
  type Client,
} from "skland-kit";

import type { SklandQrStatusResponse, SklandSnapshot } from "@/types";
import { rolesFromBinding, snapshotFromPlayerInfo } from "./normalize";
import {
  PHONE_CHALLENGE_TTL_MS,
  PHONE_CODE_RESEND_SECONDS,
  PhoneChallengeRegistry,
} from "./phone-challenge";
import { SKLAND_SESSION_TTL_SECONDS, type SklandSessionPayload } from "./session";

const SCAN_TTL_MS = 10 * 60 * 1000;
const TOKEN_REFRESH_MS = 20 * 60 * 1000;

type PendingScan = {
  client: Client;
  createdAt: number;
  lastPollAt: number;
};

type RateEntry = { timestamps: number[] };

declare global {
  var __infraCalcSklandScans: Map<string, PendingScan> | undefined;
  var __infraCalcSklandPhoneChallenges: PhoneChallengeRegistry<Client> | undefined;
  var __infraCalcSklandRate: Map<string, RateEntry> | undefined;
}

const pendingScans = globalThis.__infraCalcSklandScans ?? new Map<string, PendingScan>();
const pendingPhoneChallenges =
  globalThis.__infraCalcSklandPhoneChallenges ?? new PhoneChallengeRegistry<Client>();
const rateEntries = globalThis.__infraCalcSklandRate ?? new Map<string, RateEntry>();
globalThis.__infraCalcSklandScans = pendingScans;
globalThis.__infraCalcSklandPhoneChallenges = pendingPhoneChallenges;
globalThis.__infraCalcSklandRate = rateEntries;

export class SklandServiceError extends Error {
  constructor(
    public readonly code:
      | "NOT_CONFIGURED"
      | "INSECURE"
      | "RATE_LIMITED"
      | "AUTH_EXPIRED"
      | "AUTH_INVALID"
      | "UNAVAILABLE"
      | "BAD_DATA",
    message: string,
    public readonly status = 500
  ) {
    super(message);
  }
}

function cleanupScans(now = Date.now()): void {
  for (const [scanId, scan] of pendingScans) {
    if (now - scan.createdAt > SCAN_TTL_MS) pendingScans.delete(scanId);
  }
  pendingPhoneChallenges.cleanup(now);
  for (const [key, entry] of rateEntries) {
    const timestamps = entry.timestamps.filter((timestamp) => now - timestamp < SCAN_TTL_MS);
    if (timestamps.length === 0) rateEntries.delete(key);
    else rateEntries.set(key, { timestamps });
  }
}

function assertRate(key: string, limit: number, windowMs: number, now = Date.now()): void {
  const current = rateEntries.get(key)?.timestamps.filter((timestamp) => now - timestamp < windowMs) ?? [];
  if (current.length >= limit) throw new SklandServiceError("RATE_LIMITED", "操作过于频繁，请稍后再试。", 429);
  current.push(now);
  rateEntries.set(key, { timestamps: current });
}

function publicError(error: unknown): SklandServiceError {
  if (error instanceof SklandServiceError) return error;
  const message = error instanceof Error ? error.message : String(error);
  const cause = error && typeof error === "object" && "cause" in error ? (error as { cause?: unknown }).cause : null;
  const causeMessage = cause && typeof cause === "object" && "msg" in cause ? String((cause as { msg?: unknown }).msg ?? "") : "";
  const combinedMessage = `${message} ${causeMessage}`;
  if (/cred|token|认证|unauthor|用户未登录|登录失效/i.test(combinedMessage)) return new SklandServiceError("AUTH_EXPIRED", "森空岛登录已失效，请重新扫码。", 401);
  if (/429|频繁|limit/i.test(combinedMessage)) return new SklandServiceError("RATE_LIMITED", "森空岛请求过于频繁，请稍后再试。", 429);
  return new SklandServiceError("UNAVAILABLE", "森空岛暂时不可用，请稍后重试；MAA 导入仍可正常使用。", 502);
}

function phoneAuthenticationError(error: unknown): SklandServiceError {
  if (error instanceof SklandServiceError) return error;
  const cause =
    error && typeof error === "object" && "cause" in error
      ? (error as { cause?: unknown }).cause
      : null;
  const causeStatus =
    cause && typeof cause === "object" && "status" in cause
      ? Number((cause as { status?: unknown }).status)
      : null;
  const causeMessage =
    cause && typeof cause === "object" && "msg" in cause
      ? String((cause as { msg?: unknown }).msg ?? "")
      : "";
  if (/429|频繁|limit/i.test(causeMessage)) {
    return new SklandServiceError("RATE_LIMITED", "森空岛请求过于频繁，请稍后再试。", 429);
  }
  if (causeStatus !== null && Number.isFinite(causeStatus) && causeStatus !== 0) {
    return new SklandServiceError("AUTH_INVALID", "验证码错误或已失效，请检查后重试。", 401);
  }
  return publicError(error);
}

export function scanStatusFromError(error: unknown): "waiting" | "scanned" | "expired" | null {
  const cause = error && typeof error === "object" && "cause" in error ? (error as { cause?: unknown }).cause : null;
  if (!cause || typeof cause !== "object" || !("status" in cause)) return null;
  const status = Number((cause as { status?: unknown }).status);
  if (status === 100) return "waiting";
  if (status === 101) return "scanned";
  if (status === 102) return "expired";
  return null;
}

function scanDisplayStatus(raw: string): "waiting" | "scanned" | "expired" {
  const value = raw.toLowerCase();
  if (/expire|invalid|失效|过期|-1/.test(value)) return "expired";
  if (/scanned|confirm|已扫码|待确认/.test(value) || value === "1") return "scanned";
  return "waiting";
}

async function seedClient(payload: SklandSessionPayload): Promise<Client> {
  const client = createClient({ timeout: 30_000 });
  await client.storage.setItems([
    { key: STORAGE_CREDENTIAL_KEY, value: payload.cred },
    { key: STORAGE_OAUTH_TOKEN_KEY, value: payload.token },
    { key: STORAGE_DID_KEY, value: payload.dId },
    { key: STORAGE_USER_ID_KEY, value: payload.userId },
  ]);
  return client;
}

async function refreshedPayload(client: Client, payload: SklandSessionPayload, force = false): Promise<SklandSessionPayload> {
  if (!force && Date.now() - payload.refreshedAt < TOKEN_REFRESH_MS) return payload;
  const { token } = await client.refresh();
  return { ...payload, token, refreshedAt: Date.now(), expiresAt: Date.now() + SKLAND_SESSION_TTL_SECONDS * 1000 };
}

async function snapshotWithClient(client: Client, payload: SklandSessionPayload): Promise<{ payload: SklandSessionPayload; snapshot: SklandSnapshot }> {
  const binding = await client.collections.player.getBinding();
  const roles = rolesFromBinding(binding);
  if (roles.length === 0) throw new SklandServiceError("BAD_DATA", "该森空岛账号没有绑定可用的明日方舟角色。", 422);
  const selectedUid = roles.some((role) => role.uid === payload.selectedUid)
    ? payload.selectedUid
    : roles.find((role) => role.isDefault)?.uid ?? roles[0].uid;
  const info = await client.collections.player.getInfo({ uid: selectedUid });
  return {
    payload: { ...payload, selectedUid },
    snapshot: snapshotFromPlayerInfo(info, roles, selectedUid),
  };
}

async function completeOAuthLogin(
  client: Client,
  oauthToken: string
): Promise<{ session: SklandSessionPayload; snapshot: SklandSnapshot }> {
  const grant = await client.collections.hypergryph.grantAuthorizeCode(oauthToken);
  const auth = await client.signIn(grant.code);
  const binding = await client.collections.player.getBinding();
  const roles = rolesFromBinding(binding);
  if (roles.length === 0) {
    throw new SklandServiceError("BAD_DATA", "该森空岛账号没有绑定可用的明日方舟角色。", 422);
  }
  const selectedUid = roles.find((role) => role.isDefault)?.uid ?? roles[0].uid;
  const info = await client.collections.player.getInfo({ uid: selectedUid });
  const dId = (await client.storage.getItem(STORAGE_DID_KEY)) ?? "";
  if (!dId) throw new SklandServiceError("BAD_DATA", "森空岛设备凭证生成失败。", 502);
  const session: SklandSessionPayload = {
    version: 1,
    cred: auth.cred,
    token: auth.token,
    dId,
    userId: auth.userId,
    selectedUid,
    refreshedAt: Date.now(),
    expiresAt: Date.now() + SKLAND_SESSION_TTL_SECONDS * 1000,
  };
  return {
    session,
    snapshot: snapshotFromPlayerInfo(info, roles, selectedUid),
  };
}

export function requestIp(request: Request): string {
  return request.headers.get("cf-connecting-ip") || request.headers.get("x-real-ip") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

export async function startScan(ip: string): Promise<{ scanId: string; scanUrl: string }> {
  cleanupScans();
  assertRate(`scan:${ip}`, 10, 10 * 60 * 1000);
  assertRate("scan:global", 50, 10 * 60 * 1000);
  try {
    const client = createClient({ timeout: 30_000 });
    const result = await client.collections.hypergryph.generateScanLoginUrl();
    pendingScans.set(result.scanId, { client, createdAt: Date.now(), lastPollAt: 0 });
    return result;
  } catch (error) {
    throw publicError(error);
  }
}

export async function pollScan(scanId: string): Promise<{
  response: SklandQrStatusResponse;
  session?: SklandSessionPayload;
}> {
  cleanupScans();
  const pending = pendingScans.get(scanId);
  if (!pending) return { response: { success: false, status: "expired", error: "二维码已失效，请刷新后重试。", code: "AUTH_EXPIRED" } };
  const now = Date.now();
  if (now - pending.lastPollAt < 1_000) return { response: { success: true, status: "waiting" } };
  pending.lastPollAt = now;
  try {
    const status = await pending.client.collections.hypergryph.getScanStatus(scanId);
    if (!status.scanCode) return { response: { success: true, status: scanDisplayStatus(status.scanStatus ?? "") } };

    const oauthToken = await pending.client.collections.hypergryph.getOAuthTokenByScanCode(status.scanCode);
    const completed = await completeOAuthLogin(pending.client, oauthToken);
    pendingScans.delete(scanId);
    return {
      response: { success: true, status: "authenticated", snapshot: completed.snapshot },
      session: completed.session,
    };
  } catch (error) {
    const status = scanStatusFromError(error);
    if (status) {
      if (status === "expired") pendingScans.delete(scanId);
      return {
        response: {
          success: status !== "expired",
          status,
          ...(status === "expired" ? { error: "二维码已失效，请刷新后重试。", code: "AUTH_EXPIRED" } : {}),
        },
      };
    }
    const known = publicError(error);
    if (known.code === "AUTH_EXPIRED") pendingScans.delete(scanId);
    throw known;
  }
}

export async function startPhoneCode(phone: string): Promise<{
  challengeId: string;
  expiresInSeconds: number;
  resendAfterSeconds: number;
}> {
  cleanupScans();
  const client = createClient({ timeout: 30_000 });
  try {
    await client.collections.hypergryph.sendPhoneCode(phone);
    return {
      challengeId: pendingPhoneChallenges.create(phone, client),
      expiresInSeconds: PHONE_CHALLENGE_TTL_MS / 1000,
      resendAfterSeconds: PHONE_CODE_RESEND_SECONDS,
    };
  } catch (error) {
    throw publicError(error);
  }
}

export async function verifyPhoneCode(
  challengeId: string,
  code: string
): Promise<{ session: SklandSessionPayload; snapshot: SklandSnapshot }> {
  cleanupScans();
  const challenge = pendingPhoneChallenges.acquire(challengeId);
  if (!challenge) {
    throw new SklandServiceError("AUTH_INVALID", "验证码错误或已失效，请检查后重试。", 401);
  }

  let oauthToken: string;
  try {
    oauthToken = await challenge.client.collections.hypergryph.getOAuthTokenByPhoneCode({
      phone: challenge.phone,
      code,
    });
  } catch (error) {
    pendingPhoneChallenges.recordFailure(challengeId);
    throw phoneAuthenticationError(error);
  }

  try {
    const completed = await completeOAuthLogin(challenge.client, oauthToken);
    pendingPhoneChallenges.consume(challengeId);
    return completed;
  } catch (error) {
    pendingPhoneChallenges.release(challengeId);
    throw publicError(error);
  }
}

export async function loadSessionSnapshot(payload: SklandSessionPayload, forceRefresh = false): Promise<{
  session: SklandSessionPayload;
  snapshot: SklandSnapshot;
}> {
  try {
    const client = await seedClient(payload);
    const refreshed = await refreshedPayload(client, payload, forceRefresh);
    if (refreshed.token !== payload.token) await client.storage.setItem(STORAGE_OAUTH_TOKEN_KEY, refreshed.token);
    const result = await snapshotWithClient(client, refreshed);
    return { session: result.payload, snapshot: result.snapshot };
  } catch (error) {
    throw publicError(error);
  }
}

export async function syncSessionSnapshot(payload: SklandSessionPayload): Promise<{
  session: SklandSessionPayload;
  snapshot: SklandSnapshot;
}> {
  const key = createHash("sha256").update(payload.cred).digest("hex").slice(0, 24);
  assertRate(`sync:${key}`, 30, 60 * 60_000);
  return loadSessionSnapshot(payload, true);
}

export async function selectSessionRole(payload: SklandSessionPayload, uid: string): Promise<{
  session: SklandSessionPayload;
  snapshot: SklandSnapshot;
}> {
  if (!uid.trim()) throw new SklandServiceError("BAD_DATA", "缺少要切换的角色 UID。", 400);
  return loadSessionSnapshot({ ...payload, selectedUid: uid.trim() });
}
