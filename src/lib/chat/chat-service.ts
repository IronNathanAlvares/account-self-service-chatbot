import { InMemoryAccountRepository } from "@/lib/account/in-memory-repository";
import { SupabaseAccountRepository } from "@/lib/account/supabase-repository";
import type { AccountRepository } from "@/lib/account/repository";
import { HybridIntentParser } from "@/lib/chat/intent/parse-intent";
import type { IntentParser } from "@/lib/chat/intent/intent-types";
import type { RouterDeps } from "@/lib/chat/router/action-router";
import { handleConversationTurn } from "@/lib/chat/turn";
import type { ChatRequest, ChatResponse } from "@/lib/chat/types";
import { LoggingNotifier, type Notifier } from "@/lib/notifications/notifier";
import { ResendNotifier } from "@/lib/notifications/resend-notifier";
import { SmtpNotifier } from "@/lib/notifications/smtp-notifier";
import { createServerSupabaseClient } from "@/lib/supabase/server-client";

// Wires the pieces together and picks real vs. in-memory implementations based
// on which env vars are present, so the app runs locally with zero config and
// upgrades to Supabase + Resend in production.

export type ChatServiceDeps = {
  parser: IntentParser;
  router: RouterDeps;
};

export function createChatService(overrides?: Partial<ChatServiceDeps>): ChatServiceDeps {
  const db = createServerSupabaseClient();
  const repo: AccountRepository = db
    ? new SupabaseAccountRepository(db)
    : new InMemoryAccountRepository();

  // SMTP (Gmail/Brevo/etc.) can email any recipient, so prefer it; then Resend;
  // otherwise log the (redacted) notification locally.
  const notifier: Notifier = process.env.SMTP_HOST
    ? new SmtpNotifier()
    : process.env.RESEND_API_KEY
      ? new ResendNotifier()
      : new LoggingNotifier();

  return {
    parser: overrides?.parser ?? new HybridIntentParser(),
    router: overrides?.router ?? { repo, notifier, now: () => new Date() },
  };
}

export async function handleChat(
  request: ChatRequest,
  deps: ChatServiceDeps = createChatService(),
): Promise<ChatResponse> {
  const result = await handleConversationTurn(
    request.accountId,
    request.message,
    request.pending,
    deps.parser,
    deps.router,
    request.sessionMemory,
  );

  return {
    conversationId: request.conversationId ?? "conversation",
    message: {
      id: `assistant_${Date.now()}`,
      role: "assistant",
      content: result.reply,
      createdAt: new Date().toISOString(),
    },
    result,
  };
}
