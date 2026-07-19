import { NextResponse } from "next/server";

import { requestIp, startScan } from "@/server/skland/adapter";
import { assertSklandAvailable, sklandErrorResponse } from "@/server/skland/http";
import { assertSameOrigin } from "@/server/skland/session";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    assertSklandAvailable(request);
    const scan = await startScan(requestIp(request));
    return NextResponse.json({ success: true, ...scan });
  } catch (error) {
    return sklandErrorResponse(error);
  }
}
