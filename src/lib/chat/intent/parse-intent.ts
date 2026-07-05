import { LlmIntentParser } from "./llm-parser";
import { RuleBasedParser } from "./rule-based-parser";
import {
  CONFIDENCE_CLARIFY_THRESHOLD,
  type IntentParser,
  type ParseContext,
  type ParsedIntent,
} from "./intent-types";

// Hybrid parser: try the deterministic fast-path first, then fall back to the
// LLM for anything ambiguous. If the LLM is unavailable or errors, degrade
// gracefully to a clarifying question rather than guessing.

export class HybridIntentParser implements IntentParser {
  constructor(
    private readonly rules: IntentParser = new RuleBasedParser(),
    private readonly llm: IntentParser | null = createDefaultLlm(),
  ) {}

  async parse(message: string, context?: ParseContext): Promise<ParsedIntent> {
    // Mid slot-filling, skip the rule fast-path and let the LLM extract fields.
    if (!context?.pendingAction) {
      const ruled = await this.rules.parse(message, context);
      if (ruled.confidence >= 0.7) return ruled;
    }

    if (this.llm) {
      try {
        return await this.llm.parse(message, context);
      } catch {
        // fall through to clarify
      }
    }

    return {
      action: "clarify",
      fields: {},
      confidence: 0,
      rawMessage: message,
    };
  }
}

function createDefaultLlm(): IntentParser | null {
  return process.env.ANTHROPIC_API_KEY ? new LlmIntentParser() : null;
}

export function shouldClarify(intent: ParsedIntent): boolean {
  return (
    intent.action === "clarify" ||
    intent.confidence < CONFIDENCE_CLARIFY_THRESHOLD
  );
}
