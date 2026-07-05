import { beforeEach, describe, expect, it } from "vitest";

import { InMemoryAccountRepository } from "@/lib/account/in-memory-repository";
import type { ParsedIntent } from "@/lib/chat/intent/intent-types";
import type { ChatAction } from "@/lib/chat/types";
import { RecordingNotifier } from "@/lib/notifications/notifier";
import { handleIntent, type RouterDeps } from "./action-router";

// Acceptance contracts for the deterministic action core. These replace the
// skipped placeholders in chat-contracts.test.ts. The LLM is bypassed: we feed
// a ParsedIntent directly so we test the safe business logic in isolation.

const ACCOUNT_ID = "acc_standard_001";
const NOW = new Date("2026-07-05T12:00:00Z");

let repo: InMemoryAccountRepository;
let notifier: RecordingNotifier;
let deps: RouterDeps;

beforeEach(() => {
  repo = new InMemoryAccountRepository();
  notifier = new RecordingNotifier();
  deps = { repo, notifier, now: () => NOW };
});

function intent(action: ChatAction, fields: Record<string, unknown> = {}, rawMessage = "test"): ParsedIntent {
  return { action, fields, confidence: 0.99, rawMessage };
}

describe("chat action acceptance contracts", () => {
  it("updates the account holder phone number and queues a redacted notification", async () => {
    const result = await handleIntent(ACCOUNT_ID, intent("update_account_holder", { phone: "+353831112233" }), deps);

    expect(result.success).toBe(true);
    expect(result.account?.account.phone).toBe("+353831112233");
    expect(result.notificationQueued).toBe(true);
    expect(notifier.calls).toHaveLength(1);
  });

  it("updates the postal address, merging with the existing one", async () => {
    const result = await handleIntent(ACCOUNT_ID, intent("update_account_holder", { addressLine1: "5 Main Street", addressCity: "Cork", addressPostalCode: "T12 AB34" }), deps);
    expect(result.success).toBe(true);
    const ctx = await repo.getAccountContext(ACCOUNT_ID);
    expect(ctx?.account.address.line1).toBe("5 Main Street");
    expect(ctx?.account.address.city).toBe("Cork");
    expect(ctx?.account.address.country).toBe("Ireland");
  });

  it("rejects an invalid email without writing or notifying", async () => {
    const result = await handleIntent(ACCOUNT_ID, intent("update_account_holder", { email: "nope" }), deps);

    expect(result.success).toBe(false);
    expect(notifier.calls).toHaveLength(0);
  });

  it("adds an authorized related person with name, email, and phone", async () => {
    const result = await handleIntent(
      ACCOUNT_ID,
      intent("add_related_person", {
        relatedPersonName: "Mark Murphy",
        relatedPersonEmail: "mark@example.test",
        relatedPersonPhone: "+353831998877",
        authorizedToAct: true,
      }),
      deps,
    );

    expect(result.success).toBe(true);
    const ctx = await repo.getAccountContext(ACCOUNT_ID);
    const mark = ctx?.relatedPeople.find((p) => p.name === "Mark Murphy");
    expect(mark?.authorizedToAct).toBe(true);
    expect(notifier.calls).toHaveLength(1);
  });

  it("asks for missing details instead of adding an incomplete related person", async () => {
    const result = await handleIntent(ACCOUNT_ID, intent("add_related_person", { relatedPersonName: "Mark" }), deps);

    expect(result.success).toBe(false);
    expect(result.missingFields).toEqual(expect.arrayContaining(["email", "phone"]));
    expect(notifier.calls).toHaveLength(0);
  });

  it("updates an existing related person's phone", async () => {
    const result = await handleIntent(ACCOUNT_ID, intent("update_related_person", { relatedPersonName: "John", relatedPersonPhone: "+353830000000" }), deps);
    expect(result.success).toBe(true);
    const ctx = await repo.getAccountContext(ACCOUNT_ID);
    expect(ctx?.relatedPeople.find((p) => p.name.includes("John"))?.phone).toBe("+353830000000");
  });

  it("asks which person when the name is ambiguous", async () => {
    await repo.addRelatedPerson(ACCOUNT_ID, { name: "John Smith", email: "js@example.test", phone: "+353831111111", authorizedToAct: false });
    const result = await handleIntent(ACCOUNT_ID, intent("update_related_person", { relatedPersonName: "John", relatedPersonPhone: "+353832222222" }), deps);
    expect(result.success).toBe(false);
    expect(result.reply.toLowerCase()).toContain("which one");
    expect(result.pending?.stage).toBe("collect");
  });

  it("removes a related person only after confirmation", async () => {
    const ask = await handleIntent(ACCOUNT_ID, intent("remove_related_person", { relatedPersonName: "John" }), deps);
    expect(ask.requiresConfirmation).toBe(true);
    expect(notifier.calls).toHaveLength(0);

    const done = await handleIntent(ACCOUNT_ID, intent("remove_related_person", { relatedPersonName: "John Murphy" }), deps, { confirmed: true });
    expect(done.success).toBe(true);
    const ctx = await repo.getAccountContext(ACCOUNT_ID);
    expect(ctx?.relatedPeople.some((p) => p.name === "John Murphy")).toBe(false);
  });

  it("records a one-time promise to pay with amount and future due date", async () => {
    const result = await handleIntent(ACCOUNT_ID, intent("create_promise_to_pay", { amountCents: 50000, dueDate: "2026-08-01" }), deps);

    expect(result.success).toBe(true);
    expect(result.promiseToPay?.amountCents).toBe(50000);
    expect(notifier.calls).toHaveLength(1);
  });

  it("rejects a promise to pay with a past due date", async () => {
    const result = await handleIntent(ACCOUNT_ID, intent("create_promise_to_pay", { amountCents: 50000, dueDate: "2026-01-01" }), deps);

    expect(result.success).toBe(false);
    expect(notifier.calls).toHaveLength(0);
  });

  it("asks for confirmation before taking a payment", async () => {
    const result = await handleIntent(ACCOUNT_ID, intent("mock_payment", { amountCents: 15000 }), deps);

    expect(result.success).toBe(false);
    expect(result.requiresConfirmation).toBe(true);
    expect(result.pending?.stage).toBe("confirm");
    expect(notifier.calls).toHaveLength(0);
  });

  it("records a mocked payment transaction and deducts it from balance once confirmed", async () => {
    const before = (await repo.getAccountContext(ACCOUNT_ID))!.account.balanceCents;
    const result = await handleIntent(ACCOUNT_ID, intent("mock_payment", { amountCents: 15000 }), deps, { confirmed: true });

    expect(result.success).toBe(true);
    expect(result.transaction?.type).toBe("payment");
    expect(result.account?.account.balanceCents).toBe(before - 15000);
    expect(notifier.calls).toHaveLength(1);
  });

  it("rejects a payment larger than the balance", async () => {
    const result = await handleIntent(ACCOUNT_ID, intent("mock_payment", { amountCents: 999999999 }), deps);

    expect(result.success).toBe(false);
    expect(notifier.calls).toHaveLength(0);
  });

  it("books a future call appointment and rejects dates in the past", async () => {
    const good = await handleIntent(ACCOUNT_ID, intent("book_call_appointment", { scheduledAt: "2026-07-10T10:00:00Z", reason: "bill" }), deps);
    expect(good.success).toBe(true);
    expect(good.callAppointment?.status).toBe("scheduled");

    const bad = await handleIntent(ACCOUNT_ID, intent("book_call_appointment", { scheduledAt: "2026-07-01T10:00:00Z" }), deps);
    expect(bad.success).toBe(false);
  });

  it("reads the account without sending a notification", async () => {
    const result = await handleIntent(ACCOUNT_ID, intent("read_transactions"), deps);
    expect(result.success).toBe(true);
    expect(result.transactions?.length).toBeGreaterThan(0);
    expect(notifier.calls).toHaveLength(0);
  });

  it("answers the specific detail asked, not always the balance", async () => {
    const email = await handleIntent(ACCOUNT_ID, intent("read_account", {}, "what is my email"), deps);
    expect(email.reply).toContain("jane.murphy@example.test");

    const phone = await handleIntent(ACCOUNT_ID, intent("read_account", {}, "what is my phone number"), deps);
    expect(phone.reply).toContain("+353831234567");

    const reference = await handleIntent(ACCOUNT_ID, intent("read_account", {}, "reference number or id?"), deps);
    expect(reference.reply).toContain("EI-2026-000123");

    const overdue = await handleIntent(ACCOUNT_ID, intent("read_account", {}, "how many days am i overdue?"), deps);
    expect(overdue.reply).toContain("47 days");

    const minimum = await handleIntent(ACCOUNT_ID, intent("read_account", {}, "what is my minimum payment"), deps);
    expect(minimum.reply.toLowerCase()).toContain("minimum");

    const due = await handleIntent(ACCOUNT_ID, intent("read_account", {}, "when is my payment due?"), deps);
    expect(due.reply.toLowerCase()).toContain("due");

    expect(notifier.calls).toHaveLength(0);
  });
});
