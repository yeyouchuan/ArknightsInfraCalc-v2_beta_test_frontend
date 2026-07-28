import {
  assertSameOrigin,
  createRequestId,
  enforceRateLimit,
  PublicApiError,
  readJsonBody,
  requestClientIp,
  successResponse,
} from "@/server/api-contract";
import { verifyPhoneCode } from "@/server/skland/adapter";
import { isSklandPhoneCode } from "@/server/skland/phone-challenge";
import {
  assertSklandAvailable,
  setSklandSessionCookie,
  sklandErrorResponse,
} from "@/server/skland/http";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const requestId = createRequestId();
  const startedAt = performance.now();
  try {
    assertSameOrigin(request);
    assertSklandAvailable(request);
    enforceRateLimit(
      "skland-phone-verify",
      requestClientIp(request),
      20,
      10 * 60_000
    );
    const body = (await readJsonBody(request, 4 * 1024)) as {
      challengeId?: unknown;
      code?: unknown;
    } | null;
    const challengeId =
      typeof body?.challengeId === "string" ? body.challengeId.trim() : "";
    const code = typeof body?.code === "string" ? body.code.trim() : "";
    const fieldErrors = [
      ...(challengeId && challengeId.length <= 128
        ? []
        : [{
            path: "challengeId",
            code: "invalid_challenge",
            message: "验证码请求已失效，请重新获取。",
          }]),
      ...(isSklandPhoneCode(code)
        ? []
        : [{
            path: "code",
            code: "invalid_code",
            message: "请输入六位数字验证码。",
          }]),
    ];
    if (fieldErrors.length > 0) {
      throw new PublicApiError("AIC-REQ-1001", { fieldErrors });
    }

    const result = await verifyPhoneCode(challengeId, code);
    const response = successResponse({ snapshot: result.snapshot }, requestId);
    setSklandSessionCookie(response, request, result.session);
    return response;
  } catch (error) {
    return sklandErrorResponse(
      error,
      requestId,
      "/api/skland/auth/phone/code/verify",
      startedAt
    );
  }
}
