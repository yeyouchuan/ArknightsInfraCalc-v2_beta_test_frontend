import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { failureResponse, PublicApiError } from "../api-contract";
import { SklandServiceError } from "./adapter";
import {
  isSecureSklandRequest,
  isSklandConfigured,
  sealSklandSession,
  SKLAND_SESSION_COOKIE,
  SKLAND_SESSION_TTL_SECONDS,
  type SklandSessionPayload,
  unsealSklandSession,
} from "./session";

export async function readSklandSession(): Promise<SklandSessionPayload | null> {
  if (!isSklandConfigured()) return null;
  const value = (await cookies()).get(SKLAND_SESSION_COOKIE)?.value;
  return value ? unsealSklandSession(value) : null;
}

export function assertSklandAvailable(request: Request): void {
  if (!isSklandConfigured()) throw new PublicApiError("AIC-AUTH-2003");
  if (!isSecureSklandRequest(request)) throw new PublicApiError("AIC-AUTH-2002");
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

export function sklandErrorResponse(
  error: unknown,
  requestId: string,
  route: string,
  startedAt: number
): NextResponse {
  if (error instanceof PublicApiError) {
    return failureResponse(error, requestId, route, startedAt);
  }
  if (error instanceof Error && error.message === "请求来源无效。") {
    return failureResponse(new PublicApiError("AIC-AUTH-2002"), requestId, route, startedAt);
  }
  if (error instanceof SklandServiceError) {
    const code =
      error.code === "AUTH_EXPIRED"
        ? "AIC-AUTH-2001"
        : error.code === "AUTH_INVALID"
          ? "AIC-AUTH-2004"
          : error.code === "RATE_LIMITED"
            ? "AIC-RATE-6001"
            : error.code === "INSECURE"
              ? "AIC-AUTH-2002"
              : error.code === "NOT_CONFIGURED" || error.code === "UNAVAILABLE"
                ? "AIC-AUTH-2003"
                : "AIC-REQ-1001";
    return failureResponse(new PublicApiError(code), requestId, route, startedAt);
  }
  return failureResponse(new PublicApiError("AIC-AUTH-2003"), requestId, route, startedAt);
}
