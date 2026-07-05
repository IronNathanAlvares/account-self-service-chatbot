import { describe, expect, it } from "vitest";

import { RuleBasedParser } from "./rule-based-parser";

const parser = new RuleBasedParser();

describe("RuleBasedParser", () => {
  it("confidently classifies common read intents", async () => {
    expect((await parser.parse("Show my transactions.")).action).toBe("read_transactions");
    expect((await parser.parse("List my promises to pay")).action).toBe("read_promises_to_pay");
    expect((await parser.parse("What is my current balance?")).action).toBe("read_account");
  });

  it("returns low confidence for anything ambiguous so the LLM can take over", async () => {
    const result = await parser.parse("Add my brother so he can speak for me");
    expect(result.confidence).toBeLessThan(0.7);
  });
});
