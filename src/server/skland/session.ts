import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

export const SKLAND_SESSION_COOKIE = "skland_session_v1";
export const SKLAND_SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

export interface SklandSessionPayload {
  version: 1;
  cred: string;
  token: string;
  dId: string;
  userId: string;
  selectedUid: string;
  refreshedAt: number;
  expiresAt: number;
}

function configuredSecret(explicit?: string): string {
  const secret = explicit ?? process.env.SKLAND_SESSION_SECRET ?? "";
  if (Buffer.byteLength(secret, "utf8") < 32) {
    throw new Error("SKLAND_SESSION_SECRET 未配置或长度不足 32 字节。");
  }
  return secret;
}

function keyFor(secret?: string): Buffer {
  return createHash("sha256").update(configuredSecret(secret)).digest();
}

export function isSklandConfigured(): boolean {
  return Buffer.byteLength(process.env.SKLAND_SESSION_SECRET ?? "", "utf8") >= 32;
}

export function sklandDisabledReason(): string | null {
  return isSklandConfigured() ? null : "SKLAND_SESSION_SECRET 未配置，森空岛登录已禁用。";
}

export function sealSklandSession(payload: SklandSessionPayload, secret?: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFor(secret), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString("base64url");
}

export function unsealSklandSession(value: string, secret?: string, now = Date.now()): SklandSessionPayload | null {
  try {
    const raw = Buffer.from(value, "base64url");
    if (raw.length <= 28) return null;
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const ciphertext = raw.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", keyFor(secret), iv);
    decipher.setAuthTag(tag);
    const decoded = JSON.parse(Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8")) as Partial<SklandSessionPayload>;
    if (
      decoded.version !== 1 ||
      typeof decoded.cred !== "string" ||
      typeof decoded.token !== "string" ||
      typeof decoded.dId !== "string" ||
      typeof decoded.userId !== "string" ||
      typeof decoded.selectedUid !== "string" ||
      typeof decoded.refreshedAt !== "number" ||
      typeof decoded.expiresAt !== "number" ||
      decoded.expiresAt <= now
    ) {
      return null;
    }
    return decoded as SklandSessionPayload;
  } catch {
    return null;
  }
}

export function isSecureSklandRequest(request: Request, nodeEnv = process.env.NODE_ENV): boolean {
  if (process.env.SKLAND_ALLOW_INSECURE_HTTP === "1") return true;

  const url = new URL(request.url);
  const forwarded = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const host = (request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() || request.headers.get("host") || url.host)
    .replace(/^\[/, "")
    .replace(/\](:\d+)?$/, "")
    .split(":")[0];
  const local = nodeEnv !== "production" && [url.hostname, host].some((hostname) => hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "0.0.0.0");
  return forwarded === "https" || url.protocol === "https:" || local;
}

export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (!origin) return;
  const originUrl = new URL(origin);
  const requestUrl = new URL(request.url);
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const expectedHost = forwardedHost || request.headers.get("host") || requestUrl.host;
  if (originUrl.host !== expectedHost) throw new Error("请求来源无效。");
}
