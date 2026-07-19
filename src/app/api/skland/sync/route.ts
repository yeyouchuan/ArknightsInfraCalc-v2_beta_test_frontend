import { NextResponse } from "next/server";

import { SklandServiceError, syncSessionSnapshot } from "@/server/skland/adapter";
import {
  assertSklandAvailable,
  clearSklandSessionCookie,
  readSklandSession,
  setSklandSessionCookie,
  sklandErrorResponse,
} from "@/server/skland/http";
import { assertSameOrigin } from "@/server/skland/session";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    assertSklandAvailable(request);
    const session = await readSklandSession();
    if (!session) throw new SklandServiceError("AUTH_EXPIRED", "请先登录森空岛。", 401);
    const result = await syncSessionSnapshot(session);
    const response = NextResponse.json({ success: true, authenticated: true, snapshot: result.snapshot });
    setSklandSessionCookie(response, request, result.session);
    return response;
  } catch (error) {
    const response = sklandErrorResponse(error);
    if (error instanceof SklandServiceError && error.code === "AUTH_EXPIRED") clearSklandSessionCookie(response);
    return response;
  }
}
