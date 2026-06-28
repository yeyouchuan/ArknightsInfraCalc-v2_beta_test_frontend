import { NextResponse } from "next/server";

import { getHealth } from "@/server/infra";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await getHealth());
}

