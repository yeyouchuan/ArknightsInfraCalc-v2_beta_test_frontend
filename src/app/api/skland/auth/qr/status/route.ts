import {
  assertSameOrigin,
  createRequestId,
  enforceRateLimit,
  PublicApiError,
  readJsonBody,
  requestClientIp,
  successResponse,
} from "@/server/api-contract";
import { pollScan } from "@/server/skland/adapter";
import {
  assertSklandAvailable,
  readSklandAccountStore,
  setSklandAccountStoreCookies,
  sklandAccountSummaries,
  sklandErrorResponse,
} from "@/server/skland/http";
import { SklandAccountLimitError, upsertSklandAccount } from "@/server/skland/session";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const requestId = createRequestId();
  const startedAt = performance.now();
  try {
    assertSklandAvailable(request);
    assertSameOrigin(request);
    enforceRateLimit("skland-poll", requestClientIp(request), 120, 10 * 60_000);
    const body = await readJsonBody(request, 16 * 1024) as { scanId?: unknown } | null;
    if (typeof body?.scanId !== "string" || !body.scanId.trim()) {
      throw new PublicApiError("AIC-REQ-1001");
    }
    const result = await pollScan(body.scanId.trim());
    if (result.session && result.response.scheduleSnapshot) {
      const previous = await readSklandAccountStore();
      let upserted;
      try {
        upserted = upsertSklandAccount(previous.accounts, result.session, result.response.scheduleSnapshot.roles);
      } catch (error) {
        if (error instanceof SklandAccountLimitError) throw new PublicApiError("AIC-AUTH-2004");
        throw error;
      }
      const next = {
        ...previous,
        accounts: upserted.accounts,
        activeAccountId: upserted.account.accountId,
        migratedSnapshot: null,
      };
      const response = successResponse({
        status: result.response.status,
        scheduleSnapshot: result.response.scheduleSnapshot,
        statusSnapshot: result.response.statusSnapshot,
        accounts: sklandAccountSummaries(next),
        activeAccountId: next.activeAccountId,
      }, requestId);
      setSklandAccountStoreCookies(response, request, next, previous);
      return response;
    }
    const response = successResponse({
      status: result.response.status,
      scheduleSnapshot: result.response.scheduleSnapshot,
      statusSnapshot: result.response.statusSnapshot,
    }, requestId);
    return response;
  } catch (error) {
    return sklandErrorResponse(error, requestId, "/api/skland/auth/qr/status", startedAt);
  }
}
