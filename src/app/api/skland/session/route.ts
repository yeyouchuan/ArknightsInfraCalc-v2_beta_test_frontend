import {
  assertSameOrigin,
  createRequestId,
  enforceRateLimit,
  requestClientIp,
  successResponse,
} from "@/server/api-contract";
import { loadSessionSnapshot, SklandServiceError } from "@/server/skland/adapter";
import {
  assertSklandAvailable,
  clearSklandSessionCookie,
  readSklandSession,
  setSklandSessionCookie,
  sklandErrorResponse,
} from "@/server/skland/http";
import { isSecureSklandRequest, isSklandConfigured } from "@/server/skland/session";

export const runtime = "nodejs";
const authMethods = { qr: true as const };

export async function GET(request: Request) {
  const requestId = createRequestId();
  const startedAt = performance.now();
  if (!isSklandConfigured() || !isSecureSklandRequest(request)) {
    return successResponse({
      authenticated: false,
      configured: isSklandConfigured(),
      authMethods,
      disabledReason: "当前未开放森空岛登录，可使用 MAA 导入。",
    }, requestId);
  }
  try {
    const session = await readSklandSession();
    if (!session) {
      return successResponse({ authenticated: false, configured: true, authMethods }, requestId);
    }
    const result = await loadSessionSnapshot(session);
    const response = successResponse({
      authenticated: true,
      configured: true,
      authMethods,
      snapshot: result.snapshot,
    }, requestId);
    setSklandSessionCookie(response, request, result.session);
    return response;
  } catch (error) {
    const response = sklandErrorResponse(error, requestId, "/api/skland/session", startedAt);
    if (error instanceof SklandServiceError && error.code === "AUTH_EXPIRED") clearSklandSessionCookie(response);
    return response;
  }
}

export async function DELETE(request: Request) {
  const requestId = createRequestId();
  const startedAt = performance.now();
  try {
    assertSameOrigin(request);
    enforceRateLimit("skland-action", requestClientIp(request), 30, 60 * 60_000);
    assertSklandAvailable(request);
    const response = successResponse({ authenticated: false as const }, requestId);
    clearSklandSessionCookie(response);
    return response;
  } catch (error) {
    return sklandErrorResponse(error, requestId, "/api/skland/session", startedAt);
  }
}
