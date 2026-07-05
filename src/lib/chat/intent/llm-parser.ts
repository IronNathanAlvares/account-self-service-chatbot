import Anthropic from "@anthropic-ai/sdk";

import type { ChatAction } from "@/lib/chat/types";
import type { IntentParser, ParsedIntent, ParseContext } from "./intent-types";

// LLM boundary. Its ONLY job is to turn free text into a structured intent.
// It has no database access and executes nothing. We force a single tool call
// so the model must return schema-shaped JSON rather than prose.

const ACTIONS: ChatAction[] = [
  "read_account",
  "update_account_holder",
  "read_preferred_contact_method",
  "update_preferred_contact_method",
  "add_related_person",
  "update_related_person",
  "remove_related_person",
  "read_related_people",
  "create_promise_to_pay",
  "read_promises_to_pay",
  "mock_payment",
  "read_transactions",
  "book_call_appointment",
  "read_call_appointments",
  "clarify",
  "unsupported",
];

const SYSTEM_PROMPT = `You are the intent parser for an account self-service assistant used by a
customer with an overdue account. Classify each message into exactly one action
and extract only the fields the customer actually stated.

Rules:
- Never invent values. If a required detail is missing, leave the field out.
- Money amounts: return "amountCents" as an integer (euros x 100).
- Dates/times: return ISO 8601 in "dueDate" or "scheduledAt".
- Prefer "clarify" when the message is ambiguous, and "unsupported" for
  anything outside account self-service.
- Return a confidence between 0 and 1.`;

const TOOL: Anthropic.Tool = {
  name: "classify_account_request",
  description: "Classify the customer message into one account action + fields.",
  input_schema: {
    type: "object",
    properties: {
      action: { type: "string", enum: ACTIONS },
      confidence: { type: "number", minimum: 0, maximum: 1 },
      fields: {
        type: "object",
        description: "Only fields explicitly present in the message.",
        properties: {
          firstName: { type: "string" },
          lastName: { type: "string" },
          email: { type: "string" },
          phone: { type: "string" },
          addressLine1: { type: "string" },
          addressLine2: { type: "string" },
          addressCity: { type: "string" },
          addressPostalCode: { type: "string" },
          addressCountry: { type: "string" },
          preferredContactMethod: { type: "string", enum: ["email", "sms", "phone"] },
          relatedPersonName: { type: "string" },
          relatedPersonEmail: { type: "string" },
          relatedPersonPhone: { type: "string" },
          relationship: { type: "string" },
          authorizedToAct: { type: "boolean" },
          amountCents: { type: "integer" },
          dueDate: { type: "string" },
          scheduledAt: { type: "string" },
          reason: { type: "string" },
        },
      },
    },
    required: ["action", "confidence"],
  },
};

export class LlmIntentParser implements IntentParser {
  private client: Anthropic;
  private model: string;

  constructor(opts?: { apiKey?: string; model?: string }) {
    this.client = new Anthropic({
      apiKey: opts?.apiKey ?? process.env.ANTHROPIC_API_KEY,
    });
    // Haiku is fast and cheap and plenty for structured extraction.
    this.model = opts?.model ?? "claude-haiku-4-5-20251001";
  }

  async parse(message: string, context?: ParseContext): Promise<ParsedIntent> {
    const contextNote = context?.pendingAction
      ? `\n\nThe user is currently completing a "${context.pendingAction}" request. Already collected: ${JSON.stringify(context.pendingFields ?? {})}.`
      : "";

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 512,
      system: SYSTEM_PROMPT,
      tools: [TOOL],
      tool_choice: { type: "tool", name: TOOL.name },
      messages: [{ role: "user", content: `${message}${contextNote}` }],
    });

    const toolUse = response.content.find((block) => block.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") {
      return { action: "clarify", fields: {}, confidence: 0, rawMessage: message };
    }

    const input = toolUse.input as {
      action?: ChatAction;
      confidence?: number;
      fields?: Record<string, unknown>;
    };

    return {
      action: input.action ?? "clarify",
      fields: input.fields ?? {},
      confidence: typeof input.confidence === "number" ? input.confidence : 0.5,
      rawMessage: message,
    };
  }
}
