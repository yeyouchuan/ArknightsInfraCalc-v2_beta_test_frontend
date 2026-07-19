import { NextResponse } from "next/server";

import { loadSessionSnapshot, SklandServiceError } from "@/server/skland/adapter";
import {
  assertSklandAvailable,
  clearSklandSessionCookie,
  readSklandSession,
  setSklandSessionCookie,
  sklandErrorResponse,
} from "@/server/skland/http";
import { assertSameOrigin, isSecureSklandRequest, isSklandConfigured, sklandDisabledReason } from "@/server/skland/session";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!isSklandConfigured() || !isSecureSklandRequest(request)) {
    return NextResponse.json({
      authenticated: false,
      configured: isSklandConfigured(),
      disabledReason: sklandDisabledReason() ?? "森空岛登录要求 HTTPS；MAA 导入仍可正常使用。",
    });
  }
  try {
    const session = await readSklandSession();
    if (!session) return NextResponse.json({ authenticated: false, configured: true });
    const result = await loadSessionSnapshot(session);
    const response = NextResponse.json({ authenticated: true, configured: true, snapshot: result.snapshot });
    setSklandSessionCookie(response, request, result.session);
    return response;
  } catch (error) {
    const response = sklandErrorResponse(error);
    if (error instanceof SklandServiceError && error.code === "AUTH_EXPIRED") clearSklandSessionCookie(response);
    return response;
  }
}

export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    assertSklandAvailable(request);
    const response = NextResponse.json({ success: true, authenticated: false });
    clearSklandSessionCookie(response);
    return response;
  } catch (error) {
    return sklandErrorResponse(error);
  }
}
