import type { IntentParser, ParsedIntent } from "@/lib/chat/intent/intent-types";
import { handleIntent, type RouterDeps } from "@/lib/chat/router/action-router";
import type { ChatActionResult, ChatPendingState } from "@/lib/chat/types";

// Orchestrates a single conversation turn on top of the stateless action
// router: it resumes slot-filling and handles confirmations using the
// `pending` state the client carries back from the previous reply.

const YES = /\b(yes|yep|yeah|sure|ok|okay|confirm|go ahead|do it|proceed|please do|pay it)\b/i;
const NO = /\b(no|nope|cancel|stop|don'?t|do not|nevermind|never mind|abort)\b/i;
const CORRECTION_WORD = /\b(actually|instead|make it|change (it )?to|rather)\b/i;

export async function handleConversationTurn(
  accountId: string,
  message: string,
  pending: ChatPendingState | undefined,
  parser: IntentParser,
  deps: RouterDeps,
): Promise<ChatActionResult> {
  // 1. Awaiting a yes/no confirmation (e.g. a payment).
  if (pending?.stage === "confirm") {
    const yes = YES.test(message);
    const isCorrection = CORRECTION_WORD.test(message) || (/\d/.test(message) && !yes);

    if (isCorrection) {
      // e.g. "no, make it 200" — re-parse with context and re-confirm the new value.
      const parsed = await parser.parse(message, { pendingAction: pending.action, pendingFields: pending.fields });
      const sameAction = parsed.action === pending.action;
      const intent: ParsedIntent = {
        action: sameAction ? pending.action : parsed.action,
        fields: sameAction ? { ...pending.fields, ...parsed.fields } : parsed.fields,
        confidence: Math.max(parsed.confidence, 0.7),
        rawMessage: message,
      };
      return handleIntent(accountId, intent, deps);
    }
    if (NO.test(message)) {
      return { action: pending.action, success: false, reply: "No problem — I've cancelled that. Anything else I can help with?" };
    }
    if (yes) {
      const intent: ParsedIntent = { action: pending.action, fields: pending.fields, confidence: 1, rawMessage: message };
      return handleIntent(accountId, intent, deps, { confirmed: true });
    }
    // Neither yes/no/correction: fall through and treat the message as a fresh request.
  }

  // 2. Mid slot-filling: cancel, or merge the new details into what we have.
  if (pending?.stage === "collect") {
    if (NO.test(message)) {
      return { action: pending.action, success: false, reply: "Okay, I've stopped that. What else can I help with?" };
    }
    const parsed = await parser.parse(message, {
      pendingAction: pending.action,
      pendingFields: pending.fields,
    });
    const intent: ParsedIntent = {
      action: pending.action,
      fields: { ...pending.fields, ...parsed.fields },
      confidence: Math.max(parsed.confidence, 0.7),
      rawMessage: message,
    };
    return handleIntent(accountId, intent, deps);
  }

  // 3. Fresh message.
  const parsed = await parser.parse(message);
  return handleIntent(accountId, parsed, deps);
}
