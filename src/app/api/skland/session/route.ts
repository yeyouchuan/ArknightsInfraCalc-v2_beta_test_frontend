import {
  assertSameOrigin,
  createRequestId,
  enforceRateLimit,
  PublicApiError,
  readJsonBody,
  requestClientIp,
  successResponse,
} from "@/server/api-contract";
import {
  assertSklandAvailable,
  assertSklandFeatureEnabled,
  loadActiveSklandAccount,
  readSklandAccountStore,
  setSklandAccountStoreCookies,
  sklandAccountSummaries,
  sklandErrorResponse,
} from "@/server/skland/http";
import { removeSklandAccount } from "@/server/skland/session";
import { isSecureSklandRequest, isSklandConfigured } from "@/server/skland/session";

export const runtime = "nodejs";
const authMethods = { qr: true as const };

export async function GET(request: Request) {
  const requestId = createRequestId();
  const startedAt = performance.now();
  try {
    assertSklandFeatureEnabled();
  } catch (error) {
    return sklandErrorResponse(error, requestId, "/api/skland/session", startedAt);
  }
  if (!isSklandConfigured() || !isSecureSklandRequest(request)) {
    return successResponse({
      authenticated: false,
      configured: isSklandConfigured(),
      authMethods,
      disabledReason: "当前未开放森空岛登录，可使用 MAA 导入。",
      accounts: [],
      activeAccountId: null,
    }, requestId);
  }
  try {
    const previous = await readSklandAccountStore();
    const loaded = await loadActiveSklandAccount(previous);
    const response = successResponse({
      authenticated: Boolean(loaded.snapshot),
      configured: true,
      authMethods,
      accounts: sklandAccountSummaries(loaded.store),
      activeAccountId: loaded.store.activeAccountId,
      ...(loaded.snapshot ? { scheduleSnapshot: loaded.snapshot } : {}),
      ...(loaded.statusSnapshot ? { statusSnapshot: loaded.statusSnapshot } : {}),
    }, requestId);
    setSklandAccountStoreCookies(response, request, loaded.store, previous);
    return response;
  } catch (error) {
    return sklandErrorResponse(error, requestId, "/api/skland/session", startedAt);
  }
}

export async function DELETE(request: Request) {
  const requestId = createRequestId();
  const startedAt = performance.now();
  try {
    assertSklandAvailable(request);
    assertSameOrigin(request);
    enforceRateLimit("skland-action", requestClientIp(request), 30, 60 * 60_000);
    const previous = await readSklandAccountStore();
    let next = previous;
    if (request.body) {
      const body = await readJsonBody(request, 16 * 1024) as { accountId?: unknown } | null;
      if (typeof body?.accountId !== "string" || !body.accountId.trim()) throw new PublicApiError("AIC-REQ-1001");
      if (!previous.accounts.some((account) => account.accountId === body.accountId)) throw new PublicApiError("AIC-REQ-1001");
      const removed = removeSklandAccount(previous.accounts, previous.activeAccountId, body.accountId);
      next = { ...previous, ...removed, migratedSnapshot: null };
    } else {
      next = { ...previous, accounts: [], activeAccountId: null, migratedSnapshot: null };
    }
    const loaded = await loadActiveSklandAccount(next);
    const response = successResponse({
      authenticated: Boolean(loaded.snapshot),
      configured: true,
      authMethods,
      accounts: sklandAccountSummaries(loaded.store),
      activeAccountId: loaded.store.activeAccountId,
      ...(loaded.snapshot ? { scheduleSnapshot: loaded.snapshot } : {}),
      ...(loaded.statusSnapshot ? { statusSnapshot: loaded.statusSnapshot } : {}),
    }, requestId);
    setSklandAccountStoreCookies(response, request, loaded.store, previous);
    return response;
  } catch (error) {
    return sklandErrorResponse(error, requestId, "/api/skland/session", startedAt);
  }
}
