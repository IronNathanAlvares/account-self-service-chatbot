import { describe, expect, it } from "vitest";

import { eurosToCents, formatCents, parseAmountToCents } from "./money";

describe("money", () => {
  it("converts euros to integer cents without float drift", () => {
    expect(eurosToCents(150)).toBe(15000);
    expect(eurosToCents(150.5)).toBe(15050);
    expect(eurosToCents(0.1 + 0.2)).toBe(30);
  });

  it("parses free-text amounts", () => {
    expect(parseAmountToCents("€150")).toBe(15000);
    expect(parseAmountToCents("1,250.00")).toBe(125000);
    expect(parseAmountToCents("pay 500 euro")).toBe(50000);
    expect(parseAmountToCents("nothing")).toBeNull();
  });

  it("formats cents as EUR", () => {
    expect(formatCents(128500, "EUR")).toContain("1,285");
  });
});
