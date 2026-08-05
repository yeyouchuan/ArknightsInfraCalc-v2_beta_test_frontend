import {
  assertEmptyBody,
  assertSameOrigin,
  createRequestId,
  enforceRateLimit,
  PublicApiError,
  requestClientIp,
  successResponse,
} from "@/server/api-contract";
import { loadStatusSnapshot, SklandServiceError } from "@/server/skland/adapter";
import {
  activeSklandAccount,
  assertSklandAvailable,
  readSklandAccountStore,
  setSklandAccountStoreCookies,
  sklandAccountSummaries,
  sklandErrorResponse,
  withUpdatedSklandSession,
} from "@/server/skland/http";
import { withSklandStatusConsent } from "@/server/skland/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function statusResponse(request: Request, grant: boolean) {
  const requestId = createRequestId();
  const startedAt = performance.now();
  try {
    assertSklandAvailable(request);
    assertSameOrigin(request);
    if (grant) await assertEmptyBody(request, 1024);
    enforceRateLimit("skland-action", requestClientIp(request), 30, 60 * 60_000);
    const previous = await readSklandAccountStore();
    const account = activeSklandAccount(previous);
    if (!account) throw new SklandServiceError("AUTH_EXPIRED", "请先登录森空岛。", 401);
    const authorizedSession = grant ? withSklandStatusConsent(account.session, true) : account.session;
    if (!authorizedSession.statusConsent) throw new PublicApiError("AIC-AUTH-2006");
    const loaded = await loadStatusSnapshot(authorizedSession);
    const next = withUpdatedSklandSession(previous, account.accountId, loaded.session);
    const response = successResponse({
      authorized: true,
      accounts: sklandAccountSummaries(next),
      activeAccountId: next.activeAccountId,
      snapshot: loaded.snapshot,
    }, requestId);
    setSklandAccountStoreCookies(response, request, next, previous);
    return response;
  } catch (error) {
    return sklandErrorResponse(error, requestId, "/api/skland/status", startedAt);
  }
}

export function GET(request: Request) {
  return statusResponse(request, false);
}

export function POST(request: Request) {
  return statusResponse(request, true);
}

export async function DELETE(request: Request) {
  const requestId = createRequestId();
  const startedAt = performance.now();
  try {
    assertSklandAvailable(request);
    assertSameOrigin(request);
    await assertEmptyBody(request, 1024);
    enforceRateLimit("skland-action", requestClientIp(request), 30, 60 * 60_000);
    const previous = await readSklandAccountStore();
    const account = activeSklandAccount(previous);
    if (!account) throw new SklandServiceError("AUTH_EXPIRED", "请先登录森空岛。", 401);
    const next = withUpdatedSklandSession(
      previous,
      account.accountId,
      withSklandStatusConsent(account.session, false)
    );
    const response = successResponse({
      authorized: false,
      accounts: sklandAccountSummaries(next),
      activeAccountId: next.activeAccountId,
    }, requestId);
    setSklandAccountStoreCookies(response, request, next, previous);
    return response;
  } catch (error) {
    return sklandErrorResponse(error, requestId, "/api/skland/status", startedAt);
  }
}
