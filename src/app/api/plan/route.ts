import { NextResponse } from "next/server";

import { runPlan } from "@/server/infra";
import { validateLayoutJson } from "@/layout-validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const errors = validateLayoutJson(body?.layout);
  if (errors.length) {
    return NextResponse.json({ success: false, error: errors.join("\n"), validationErrors: errors }, { status: 400 });
  }
  const result = await runPlan(body);
  return NextResponse.json(result, { status: result.success ? 200 : 400 });
}
