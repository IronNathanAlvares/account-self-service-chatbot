import type { ChatAction } from "@/lib/chat/types";
import type { IntentParser, ParsedIntent, ParseContext } from "./intent-types";

// A cheap, deterministic fast-path for unambiguous read intents and a few
// obvious commands. It keeps latency and cost down and gives a sensible
// fallback when the LLM is unavailable. Anything it is unsure about it returns
// with low confidence so the LLM parser can take over.

type Rule = { action: ChatAction; patterns: RegExp[] };

const RULES: Rule[] = [
  {
    action: "read_transactions",
    patterns: [/\b(show|list|see|view).*(transaction|payment history)/i],
  },
  {
    action: "read_promises_to_pay",
    patterns: [/\b(show|list|see|view).*(promise)/i],
  },
  {
    action: "read_call_appointments",
    patterns: [/\b(what|show|list).*(call|appointment)s?\b.*book|booked call/i],
  },
  {
    action: "read_related_people",
    patterns: [/\b(show|list|who).*(related|authorized|people|represent)/i],
  },
  {
    action: "read_preferred_contact_method",
    patterns: [/\b(what|how).*(preferred|contact method)/i],
  },
  {
    action: "read_account",
    patterns: [
      /\b(what|what's|whats|show|tell)\b.*\b(email|phone|mobile|number|address|balance|name|reference)\b/i,
      /\b(my|the|current)\s+(email|phone|address|balance|name|reference)\b/i,
      /\b(how much|what).*(owe|balance|outstanding)\b/i,
    ],
  },
];

export class RuleBasedParser implements IntentParser {
  async parse(message: string, _context?: ParseContext): Promise<ParsedIntent> {
    void _context;
    const text = message.trim();

    // Any command with a mutation verb must go to the LLM for structured
    // extraction. The read fast-path only handles pure questions, otherwise
    // "change my phone to X" would wrongly match the "my phone" read pattern.
    if (/\b(change|update|set|edit|modify|add|remove|delete|book|schedule|cancel)\b/i.test(text)) {
      return { action: "clarify", fields: {}, confidence: 0, rawMessage: message };
    }

    for (const rule of RULES) {
      if (rule.patterns.some((p) => p.test(text))) {
        return {
          action: rule.action,
          fields: {},
          confidence: 0.8,
          rawMessage: message,
        };
      }
    }

    // No confident rule matched. Signal low confidence so a smarter parser runs.
    return {
      action: "clarify",
      fields: {},
      confidence: 0,
      rawMessage: message,
    };
  }
}
