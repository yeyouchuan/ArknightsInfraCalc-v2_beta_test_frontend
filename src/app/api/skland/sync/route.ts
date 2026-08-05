import {
  assertSameOrigin,
  createRequestId,
  enforceRateLimit,
  requestClientIp,
  successResponse,
} from "@/server/api-contract";
import { SklandServiceError, syncSessionSnapshot } from "@/server/skland/adapter";
import {
  activeSklandAccount,
  assertSklandAvailable,
  readSklandAccountStore,
  setSklandAccountStoreCookies,
  sklandAccountSummaries,
  sklandErrorResponse,
  type SklandAccountStore,
  withUpdatedSklandAccount,
} from "@/server/skland/http";
import { removeSklandAccount } from "@/server/skland/session";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const requestId = createRequestId();
  const startedAt = performance.now();
  let previous: SklandAccountStore | null = null;
  try {
    assertSklandAvailable(request);
    assertSameOrigin(request);
    enforceRateLimit("skland-action", requestClientIp(request), 30, 60 * 60_000);
    previous = await readSklandAccountStore();
    const account = activeSklandAccount(previous);
    if (!account) throw new SklandServiceError("AUTH_EXPIRED", "请先登录森空岛。", 401);
    const result = await syncSessionSnapshot(account.session);
    const next = withUpdatedSklandAccount(previous, account.accountId, result.session, result.snapshot);
    const response = successResponse({
      authenticated: true,
      configured: true,
      accounts: sklandAccountSummaries(next),
      activeAccountId: next.activeAccountId,
      scheduleSnapshot: result.snapshot,
    }, requestId);
    setSklandAccountStoreCookies(response, request, next, previous);
    return response;
  } catch (error) {
    const response = sklandErrorResponse(error, requestId, "/api/skland/sync", startedAt);
    if (previous && error instanceof SklandServiceError && error.code === "AUTH_EXPIRED" && previous.activeAccountId) {
      const removed = removeSklandAccount(previous.accounts, previous.activeAccountId, previous.activeAccountId);
      const next = { ...previous, ...removed, migratedSnapshot: null };
      setSklandAccountStoreCookies(response, request, next, previous);
    }
    return response;
  }
}
