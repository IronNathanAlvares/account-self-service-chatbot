import { NextResponse } from "next/server";

import { handleChat } from "@/lib/chat/chat-service";
import type { ChatRequest } from "@/lib/chat/types";

// PDF encryption + Resend need the Node runtime (not Edge).
export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json()) as Partial<ChatRequest>;
  const accountId = body.accountId?.trim();
  const message = body.message?.trim();

  if (!accountId || !message) {
    return NextResponse.json(
      { error: "accountId and message are required." },
      { status: 400 },
    );
  }

  try {
    const response = await handleChat({
      accountId,
      message,
      conversationId: body.conversationId,
    });
    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    // Never leak account detail in error messages.
    console.error("[/api/chat] failed", error instanceof Error ? error.message : "unknown");
    return NextResponse.json(
      { error: "Something went wrong handling that request." },
      { status: 500 },
    );
  }
}
