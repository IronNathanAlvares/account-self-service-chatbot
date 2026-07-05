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

  it("never treats a mutation command as a read", async () => {
    expect((await parser.parse("Change my phone to +353870398649")).confidence).toBeLessThan(0.7);
    expect((await parser.parse("Update my email to a@b.com")).confidence).toBeLessThan(0.7);
    expect((await parser.parse("Set my preferred contact to sms")).confidence).toBeLessThan(0.7);
    // Pure reads still take the fast path.
    expect((await parser.parse("What's my phone number?")).action).toBe("read_account");
    expect((await parser.parse("Show my promises to pay")).action).toBe("read_promises_to_pay");
  });
});
