import { describe, expect, it } from "vitest";

import {
  emailSchema,
  isFutureDate,
  phoneSchema,
  relatedPersonInputSchema,
  validate,
} from "./validators";

describe("validators", () => {
  it("accepts valid emails and rejects bad ones", () => {
    expect(validate(emailSchema, "jane@example.test").ok).toBe(true);
    expect(validate(emailSchema, "not-an-email").ok).toBe(false);
    expect(validate(emailSchema, "").ok).toBe(false);
  });

  it("accepts E.164-style phones and rejects junk", () => {
    expect(validate(phoneSchema, "+353831112233").ok).toBe(true);
    expect(validate(phoneSchema, "0831112233").ok).toBe(true);
    expect(validate(phoneSchema, "12").ok).toBe(false);
    expect(validate(phoneSchema, "call me").ok).toBe(false);
  });

  it("requires name, email and phone for a related person", () => {
    const bad = validate(relatedPersonInputSchema, { name: "", email: "x", phone: "1" });
    expect(bad.ok).toBe(false);
    const good = validate(relatedPersonInputSchema, {
      name: "Mark Murphy",
      email: "mark@example.test",
      phone: "+353831998877",
      authorizedToAct: true,
    });
    expect(good.ok).toBe(true);
  });

  it("treats only strictly-future dates as future", () => {
    const now = new Date("2026-07-05T12:00:00Z");
    expect(isFutureDate("2026-08-01", now)).toBe(true);
    expect(isFutureDate("2026-07-04", now)).toBe(false);
    expect(isFutureDate("not-a-date", now)).toBe(false);
  });
});
