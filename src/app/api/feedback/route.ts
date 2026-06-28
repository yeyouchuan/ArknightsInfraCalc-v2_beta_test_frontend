import { NextResponse } from "next/server";

import { saveFeedback } from "@/server/infra";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const savedAt = new Date().toISOString();

  try {
    const body = await request.json();
    return NextResponse.json(await saveFeedback(body));
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        savedAt,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 400 }
    );
  }
}

