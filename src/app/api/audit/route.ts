import { NextResponse } from "next/server";

import { listChangeEvents } from "@/lib/account/audit";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const accountId = new URL(request.url).searchParams.get("accountId")?.trim();
  if (!accountId) {
    return NextResponse.json({ error: "accountId is required." }, { status: 400 });
  }

  try {
    const events = await listChangeEvents(accountId);
    return NextResponse.json({ events }, { status: 200 });
  } catch (error) {
    console.error("[/api/audit] failed", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "Could not load activity." }, { status: 500 });
  }
}
