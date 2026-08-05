import {
  assertEmptyBody,
  assertSameOrigin,
  createRequestId,
  enforceRateLimit,
  requestClientIp,
  successResponse,
} from "@/server/api-contract";
import { deleteSklandOwnedData } from "@/server/infra";
import {
  assertSklandAvailable,
  readSklandAccountStore,
  setSklandAccountStoreCookies,
  sklandErrorResponse,
} from "@/server/skland/http";
import { sklandDataOwnerTag } from "@/server/skland/session";

export const runtime = "nodejs";

export async function DELETE(request: Request) {
  const requestId = createRequestId();
  const startedAt = performance.now();
  try {
    assertSklandAvailable(request);
    assertSameOrigin(request);
    await assertEmptyBody(request, 1024);
    enforceRateLimit("skland-delete", requestClientIp(request), 5, 60 * 60_000);
    const previous = await readSklandAccountStore();
    const deleted = await deleteSklandOwnedData(
      previous.accounts.map((account) => sklandDataOwnerTag(account.session.userId))
    );
    const next = {
      ...previous,
      accounts: [],
      activeAccountId: null,
      migratedSnapshot: null,
    };
    const response = successResponse({ deleted: true, ...deleted }, requestId);
    setSklandAccountStoreCookies(response, request, next, previous);
    return response;
  } catch (error) {
    return sklandErrorResponse(error, requestId, "/api/skland/data", startedAt);
  }
}
