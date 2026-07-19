import { NextResponse } from "next/server";

import { pollScan, SklandServiceError } from "@/server/skland/adapter";
import { assertSklandAvailable, setSklandSessionCookie, sklandErrorResponse } from "@/server/skland/http";
import { assertSameOrigin } from "@/server/skland/session";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    assertSklandAvailable(request);
    const body = (await request.json().catch(() => null)) as { scanId?: unknown } | null;
    if (typeof body?.scanId !== "string" || !body.scanId.trim()) {
      throw new SklandServiceError("BAD_DATA", "缺少二维码会话标识。", 400);
    }
    const result = await pollScan(body.scanId.trim());
    const response = NextResponse.json(result.response);
    if (result.session) setSklandSessionCookie(response, request, result.session);
    return response;
  } catch (error) {
    return sklandErrorResponse(error);
  }
}
