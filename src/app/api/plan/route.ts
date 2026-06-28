import { NextResponse } from "next/server";

import { runPlan } from "@/server/infra";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const result = await runPlan(body);
  return NextResponse.json(result, { status: result.success ? 200 : 400 });
}
