import { beforeEach, describe, expect, it } from "vitest";

import { InMemoryAccountRepository } from "@/lib/account/in-memory-repository";
import type { IntentParser, ParseContext, ParsedIntent } from "@/lib/chat/intent/intent-types";
import type { RouterDeps } from "@/lib/chat/router/action-router";
import { handleConversationTurn } from "@/lib/chat/turn";
import type { ChatAction } from "@/lib/chat/types";
import { RecordingNotifier } from "@/lib/notifications/notifier";

// Multi-turn orchestration: slot-filling across messages and two-phase confirm.

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

class StubParser implements IntentParser {
  constructor(private readonly fn: (message: string, context?: ParseContext) => ParsedIntent) {}
  async parse(message: string, context?: ParseContext): Promise<ParsedIntent> {
    return this.fn(message, context);
  }
}

function intent(action: ChatAction, fields: Record<string, unknown> = {}): ParsedIntent {
  return { action, fields, confidence: 0.95, rawMessage: "test" };
}

describe("handleConversationTurn", () => {
  it("collects related-person details across two turns", async () => {
    const parser = new StubParser((msg) =>
      msg.includes("@")
        ? intent("add_related_person", { relatedPersonEmail: "mark@example.test", relatedPersonPhone: "+353831998877" })
        : intent("add_related_person", { relatedPersonName: "Mark", relationship: "brother" }),
    );

    const first = await handleConversationTurn(ACCOUNT_ID, "add my brother Mark", undefined, parser, deps);
    expect(first.pending?.stage).toBe("collect");
    expect(first.missingFields).toEqual(expect.arrayContaining(["email", "phone"]));
    expect(notifier.calls).toHaveLength(0);

    const second = await handleConversationTurn(ACCOUNT_ID, "mark@example.test, +353831998877", first.pending, parser, deps);
    expect(second.success).toBe(true);
    const ctx = await repo.getAccountContext(ACCOUNT_ID);
    expect(ctx?.relatedPeople.some((p) => p.name === "Mark")).toBe(true);
    expect(notifier.calls).toHaveLength(1);
  });

  it("takes a payment only after an explicit yes", async () => {
    const parser = new StubParser(() => intent("mock_payment", { amountCents: 15000 }));

    const ask = await handleConversationTurn(ACCOUNT_ID, "pay 150 now", undefined, parser, deps);
    expect(ask.requiresConfirmation).toBe(true);
    expect(ask.pending?.stage).toBe("confirm");
    expect(notifier.calls).toHaveLength(0);

    const before = (await repo.getAccountContext(ACCOUNT_ID))!.account.balanceCents;
    const done = await handleConversationTurn(ACCOUNT_ID, "yes", ask.pending, parser, deps);
    expect(done.success).toBe(true);
    expect(done.account?.account.balanceCents).toBe(before - 15000);
  });

  it("cancels a payment on no", async () => {
    const parser = new StubParser(() => intent("mock_payment", { amountCents: 15000 }));
    const ask = await handleConversationTurn(ACCOUNT_ID, "pay 150 now", undefined, parser, deps);
    const cancelled = await handleConversationTurn(ACCOUNT_ID, "no thanks", ask.pending, parser, deps);

    expect(cancelled.success).toBe(false);
    expect(notifier.calls).toHaveLength(0);
    const ctx = await repo.getAccountContext(ACCOUNT_ID);
    expect(ctx?.transactions.every((t) => t.description !== "Mocked card payment")).toBe(true);
  });
});
