import { NextResponse } from "next/server";

import { loadAccountContext } from "@/lib/account/load";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const accountId = new URL(request.url).searchParams.get("accountId")?.trim();
  if (!accountId) {
    return NextResponse.json({ error: "accountId is required." }, { status: 400 });
  }

  try {
    const account = await loadAccountContext(accountId);
    return NextResponse.json(account, { status: 200 });
  } catch (error) {
    console.error("[/api/account] failed", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "Could not load the account." }, { status: 500 });
  }
}
