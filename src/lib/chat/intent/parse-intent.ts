import { LlmIntentParser } from "./llm-parser";
import { OpenAICompatibleParser } from "./openai-compatible-parser";
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
  // Prefer whichever provider is configured. Free options first.
  if (process.env.GROQ_API_KEY) {
    return new OpenAICompatibleParser({
      baseUrl: "https://api.groq.com/openai/v1",
      apiKey: process.env.GROQ_API_KEY,
      model: process.env.LLM_MODEL ?? "llama-3.3-70b-versatile",
    });
  }
  if (process.env.OPENROUTER_API_KEY) {
    return new OpenAICompatibleParser({
      baseUrl: "https://openrouter.ai/api/v1",
      apiKey: process.env.OPENROUTER_API_KEY,
      model: process.env.LLM_MODEL ?? "meta-llama/llama-3.3-70b-instruct:free",
    });
  }
  if (process.env.GEMINI_API_KEY) {
    return new OpenAICompatibleParser({
      baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
      apiKey: process.env.GEMINI_API_KEY,
      model: process.env.LLM_MODEL ?? "gemini-2.0-flash",
    });
  }
  // Ollama (local models, e.g. mistral / llama3.2 / qwen). Free, but only
  // reachable where Ollama runs - great for local dev, not for a cloud deploy.
  if (process.env.OLLAMA_MODEL) {
    return new OpenAICompatibleParser({
      baseUrl: process.env.OLLAMA_BASE_URL ?? "http://localhost:11434/v1",
      apiKey: "ollama",
      model: process.env.OLLAMA_MODEL,
    });
  }
  // Generic OpenAI-compatible endpoint (incl. OpenAI itself).
  if (process.env.LLM_API_KEY && process.env.LLM_BASE_URL) {
    return new OpenAICompatibleParser({
      baseUrl: process.env.LLM_BASE_URL,
      apiKey: process.env.LLM_API_KEY,
      model: process.env.LLM_MODEL ?? "gpt-4o-mini",
    });
  }
  if (process.env.ANTHROPIC_API_KEY) {
    return new LlmIntentParser();
  }
  return null;
}

export function shouldClarify(intent: ParsedIntent): boolean {
  return (
    intent.action === "clarify" ||
    intent.confidence < CONFIDENCE_CLARIFY_THRESHOLD
  );
}
