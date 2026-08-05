import {
  assertSameOrigin,
  createRequestId,
  enforceRateLimit,
  PublicApiError,
  readJsonBody,
  requestClientIp,
  successResponse,
} from "@/server/api-contract";
import { isCurrentPolicyConsent } from "@/legal-policy";
import { startScan } from "@/server/skland/adapter";
import { assertSklandAvailable, sklandErrorResponse } from "@/server/skland/http";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const requestId = createRequestId();
  const startedAt = performance.now();
  try {
    assertSklandAvailable(request);
    assertSameOrigin(request);
    const ip = requestClientIp(request);
    enforceRateLimit("skland-qr", ip, 10, 10 * 60_000);
    const body = await readJsonBody(request, 16 * 1024) as { consent?: unknown } | null;
    if (!isCurrentPolicyConsent(body?.consent)) throw new PublicApiError("AIC-AUTH-2005");
    return successResponse(await startScan(ip, body.consent), requestId);
  } catch (error) {
    return sklandErrorResponse(error, requestId, "/api/skland/auth/qr", startedAt);
  }
}
