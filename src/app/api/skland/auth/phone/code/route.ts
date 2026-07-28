import {
  assertSameOrigin,
  createRequestId,
  enforceRateLimit,
  PublicApiError,
  readJsonBody,
  requestClientIp,
  successResponse,
} from "@/server/api-contract";
import { startPhoneCode } from "@/server/skland/adapter";
import {
  normalizeSklandPhone,
  sklandPhoneRateSubject,
} from "@/server/skland/phone-challenge";
import { assertSklandAvailable, sklandErrorResponse } from "@/server/skland/http";

export const runtime = "nodejs";

const TEN_MINUTES_MS = 10 * 60_000;

export async function POST(request: Request) {
  const requestId = createRequestId();
  const startedAt = performance.now();
  try {
    assertSameOrigin(request);
    assertSklandAvailable(request);
    const body = (await readJsonBody(request, 4 * 1024)) as { phone?: unknown } | null;
    const phone = typeof body?.phone === "string" ? normalizeSklandPhone(body.phone) : null;
    if (!phone) {
      throw new PublicApiError("AIC-REQ-1001", {
        fieldErrors: [{
          path: "phone",
          code: "invalid_phone",
          message: "请输入有效的中国大陆手机号。",
        }],
      });
    }

    const ip = requestClientIp(request);
    const subject = sklandPhoneRateSubject(phone);
    enforceRateLimit("skland-phone-code-ip", ip, 10, TEN_MINUTES_MS);
    enforceRateLimit("skland-phone-code-minute", subject, 1, 60_000);
    enforceRateLimit("skland-phone-code-window", subject, 5, TEN_MINUTES_MS);
    return successResponse(await startPhoneCode(phone), requestId);
  } catch (error) {
    return sklandErrorResponse(error, requestId, "/api/skland/auth/phone/code", startedAt);
  }
}
