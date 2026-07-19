import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { SklandServiceError } from "./adapter";
import {
  isSecureSklandRequest,
  isSklandConfigured,
  sealSklandSession,
  SKLAND_SESSION_COOKIE,
  SKLAND_SESSION_TTL_SECONDS,
  sklandDisabledReason,
  type SklandSessionPayload,
  unsealSklandSession,
} from "./session";

export async function readSklandSession(): Promise<SklandSessionPayload | null> {
  if (!isSklandConfigured()) return null;
  const value = (await cookies()).get(SKLAND_SESSION_COOKIE)?.value;
  return value ? unsealSklandSession(value) : null;
}

export function assertSklandAvailable(request: Request): void {
  if (!isSklandConfigured()) throw new SklandServiceError("NOT_CONFIGURED", sklandDisabledReason() ?? "森空岛登录未配置。", 503);
  if (!isSecureSklandRequest(request)) throw new SklandServiceError("INSECURE", "森空岛登录要求 HTTPS；MAA 导入仍可正常使用。", 403);
}

export function setSklandSessionCookie(response: NextResponse, request: Request, session: SklandSessionPayload): void {
  const url = new URL(request.url);
  const forwarded = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  response.cookies.set(SKLAND_SESSION_COOKIE, sealSklandSession(session), {
    httpOnly: true,
    sameSite: "lax",
    secure: forwarded === "https" || url.protocol === "https:",
    maxAge: SKLAND_SESSION_TTL_SECONDS,
    path: "/",
  });
}

export function clearSklandSessionCookie(response: NextResponse): void {
  response.cookies.set(SKLAND_SESSION_COOKIE, "", { httpOnly: true, sameSite: "lax", maxAge: 0, path: "/" });
}

export function sklandErrorResponse(error: unknown): NextResponse {
  const known = error instanceof SklandServiceError
    ? error
    : error instanceof Error && error.message === "请求来源无效。"
      ? new SklandServiceError("BAD_DATA", error.message, 403)
      : new SklandServiceError("UNAVAILABLE", "森空岛暂时不可用，请稍后重试。", 502);
  return NextResponse.json({ success: false, authenticated: false, error: known.message, code: known.code }, { status: known.status });
}
