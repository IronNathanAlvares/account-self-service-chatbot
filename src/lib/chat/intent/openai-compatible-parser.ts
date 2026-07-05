import type { ChatAction } from "@/lib/chat/types";
import type { IntentParser, ParsedIntent, ParseContext } from "./intent-types";

// Provider-agnostic LLM parser that speaks the OpenAI Chat Completions API.
// Works with any OpenAI-compatible endpoint — including several FREE ones:
//   Groq       base https://api.groq.com/openai/v1        model llama-3.3-70b-versatile
//   OpenRouter base https://openrouter.ai/api/v1          model meta-llama/llama-3.3-70b-instruct:free
//   Gemini     base https://generativelanguage.googleapis.com/v1beta/openai  model gemini-2.0-flash
//   OpenAI     base https://api.openai.com/v1             model gpt-4o-mini
//
// Like the Anthropic parser, it ONLY classifies — it returns a structured
// intent and never touches the database.

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
customer with an overdue account. Read the customer's message and respond with
ONLY a JSON object (no prose, no markdown) of this exact shape:

{"action": <one of ${ACTIONS.join(", ")}>,
 "confidence": <number 0..1>,
 "fields": { ...only the fields the customer actually stated... }}

Possible fields (include only those present in the message):
- firstName, lastName, email, phone            (for update_account_holder)
- readField: one of name|email|phone|address|balance|reference  (for read_account, the specific thing asked for)
- preferredContactMethod: email|sms|phone      (for update_preferred_contact_method)
- relatedPersonName, relatedPersonEmail, relatedPersonPhone, relationship, authorizedToAct
- amountCents: integer euros x 100             (for mock_payment / create_promise_to_pay)
- dueDate: ISO 8601 date                       (for create_promise_to_pay)
- scheduledAt: ISO 8601 date-time              (for book_call_appointment)
- reason: string

Rules:
- Never invent values. Omit any field not stated.
- "What's my email?" -> read_account with readField=email.
- "Change my email to x" -> update_account_holder with email=x.
- Money like "150 euro" -> amountCents 15000.
- Ambiguous -> action clarify. Off-topic -> action unsupported.`;

export type OpenAICompatibleOptions = {
  baseUrl: string;
  apiKey: string;
  model: string;
};

export class OpenAICompatibleParser implements IntentParser {
  constructor(private readonly opts: OpenAICompatibleOptions) {}

  async parse(message: string, context?: ParseContext): Promise<ParsedIntent> {
    const contextNote = context?.pendingAction
      ? `\n\n(Currently completing a "${context.pendingAction}" request. Already collected: ${JSON.stringify(context.pendingFields ?? {})}.)`
      : "";

    const response = await fetch(`${this.opts.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.opts.apiKey}`,
      },
      body: JSON.stringify({
        model: this.opts.model,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `${message}${contextNote}` },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`LLM request failed: ${response.status}`);
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content ?? "{}";
    const parsed = safeParse(content);

    return {
      action: (parsed.action as ChatAction) ?? "clarify",
      fields: (parsed.fields as Record<string, unknown>) ?? {},
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.6,
      rawMessage: message,
    };
  }
}

function safeParse(content: string): Record<string, unknown> {
  try {
    // Some models wrap JSON in ```json fences; strip them defensively.
    const cleaned = content.replace(/```json\s*|\s*```/g, "").trim();
    return JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    return {};
  }
}
