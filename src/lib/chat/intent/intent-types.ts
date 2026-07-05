import type { ChatAction } from "@/lib/chat/types";

/**
 * The structured output of the intent layer. The LLM (or the rule-based
 * fast-path) only ever produces one of these - it never touches the database.
 * Deterministic code downstream validates `fields` and executes the action.
 */
export type ParsedIntent = {
  action: ChatAction;
  /** Loosely-typed extracted slots; validated per-action before any write. */
  fields: Record<string, unknown>;
  /** 0..1 confidence. Low confidence routes to a clarifying question. */
  confidence: number;
  rawMessage: string;
};

export type ParseContext = {
  /** When mid slot-filling, the action we are still collecting fields for. */
  pendingAction?: ChatAction;
  /** Fields already collected across turns for `pendingAction`. */
  pendingFields?: Record<string, unknown>;
};

export interface IntentParser {
  parse(message: string, context?: ParseContext): Promise<ParsedIntent>;
}

export const CONFIDENCE_CLARIFY_THRESHOLD = 0.55;
