import type { AccountRepository, AccountHolderPatch } from "@/lib/account/repository";
import type { ChatActionResult } from "@/lib/chat/types";
import type { ParsedIntent } from "@/lib/chat/intent/intent-types";
import type { Notifier } from "@/lib/notifications/notifier";
import {
  contactMethodSchema,
  emailSchema,
  isFutureDate,
  phoneSchema,
  relatedPersonInputSchema,
  validate,
} from "@/lib/chat/validation/validators";

// The deterministic core. It receives an already-parsed intent and executes it
// against the repository, validating every field first and sending a redacted
// notification whenever persisted data changes. It has no knowledge of the LLM.

export type RouterDeps = {
  repo: AccountRepository;
  notifier: Notifier;
  now: () => Date;
};

// --- small field readers over the loosely-typed intent.fields --------------
function str(fields: Record<string, unknown>, key: string): string | undefined {
  const v = fields[key];
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}
function num(fields: Record<string, unknown>, key: string): number | undefined {
  const v = fields[key];
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}
function bool(fields: Record<string, unknown>, key: string): boolean | undefined {
  const v = fields[key];
  return typeof v === "boolean" ? v : undefined;
}

function ok(action: ChatActionResult["action"], reply: string, extra: Partial<ChatActionResult> = {}): ChatActionResult {
  return { action, success: true, reply, ...extra };
}
function fail(action: ChatActionResult["action"], reply: string, extra: Partial<ChatActionResult> = {}): ChatActionResult {
  return { action, success: false, reply, ...extra };
}

export async function handleIntent(
  accountId: string,
  intent: ParsedIntent,
  deps: RouterDeps,
): Promise<ChatActionResult> {
  const { repo, notifier } = deps;
  const { action, fields } = intent;

  const context = await repo.getAccountContext(accountId);
  if (!context) {
    return fail("unsupported", "I couldn't find that account.");
  }

  // Fetches the freshest snapshot and sends the redacted change notification.
  const notify = async (changeSummary: string): Promise<boolean> => {
    const snapshot = (await repo.getAccountContext(accountId)) ?? context;
    const result = await notifier.send({
      accountId,
      changedBy: "account_holder",
      changeSummary,
      accountSnapshot: snapshot,
    });
    return result.sent || result.notificationId.length > 0;
  };

  switch (action) {
    // ---- reads (no writes, no notification) --------------------------------
    case "read_account":
      return ok("read_account", `Your account balance is currently ${context.account.balanceCents / 100} ${context.account.currency}. Ask me for your email, phone, or address any time.`, { account: context });
    case "read_preferred_contact_method":
      return ok("read_preferred_contact_method", `Your preferred contact method is ${context.account.preferredContactMethod}.`, { account: context });
    case "read_related_people":
      return ok("read_related_people", `You have ${context.relatedPeople.length} related ${context.relatedPeople.length === 1 ? "person" : "people"} on file.`, { relatedPeople: context.relatedPeople });
    case "read_promises_to_pay":
      return ok("read_promises_to_pay", `You have ${context.promisesToPay.length} promise(s) to pay.`, { promisesToPay: context.promisesToPay });
    case "read_transactions":
      return ok("read_transactions", `You have ${context.transactions.length} transaction(s).`, { transactions: context.transactions });
    case "read_call_appointments":
      return ok("read_call_appointments", `You have ${context.callAppointments.length} upcoming call(s).`, { callAppointments: context.callAppointments });

    // ---- account holder updates -------------------------------------------
    case "update_account_holder": {
      const patch: AccountHolderPatch = {};
      const email = str(fields, "email");
      const phone = str(fields, "phone");
      const firstName = str(fields, "firstName");
      const lastName = str(fields, "lastName");

      if (email !== undefined) {
        const v = validate(emailSchema, email);
        if (!v.ok) return fail("update_account_holder", v.errors[0]);
        patch.email = v.value;
      }
      if (phone !== undefined) {
        const v = validate(phoneSchema, phone);
        if (!v.ok) return fail("update_account_holder", v.errors[0]);
        patch.phone = v.value;
      }
      if (firstName !== undefined) patch.firstName = firstName;
      if (lastName !== undefined) patch.lastName = lastName;

      if (Object.keys(patch).length === 0) {
        return fail("clarify", "What would you like to change — your name, email, phone, or address?", { missingFields: ["field"] });
      }

      const updated = await repo.updateAccountHolder(accountId, patch);
      const queued = await notify(`Updated account holder details: ${Object.keys(patch).join(", ")}`);
      return ok("update_account_holder", `Done. I've updated your ${Object.keys(patch).join(", ")}.`, { account: updated, notificationQueued: queued });
    }

    case "update_preferred_contact_method": {
      const method = str(fields, "preferredContactMethod");
      const v = validate(contactMethodSchema, method);
      if (!v.ok) return fail("update_preferred_contact_method", "Preferred contact must be email, sms, or phone.");
      const updated = await repo.updateAccountHolder(accountId, { preferredContactMethod: v.value });
      const queued = await notify(`Preferred contact method set to ${v.value}`);
      return ok("update_preferred_contact_method", `Your preferred contact method is now ${v.value}.`, { account: updated, notificationQueued: queued });
    }

    // ---- related people ----------------------------------------------------
    case "add_related_person": {
      const candidate = {
        name: str(fields, "relatedPersonName"),
        email: str(fields, "relatedPersonEmail"),
        phone: str(fields, "relatedPersonPhone"),
        relationship: str(fields, "relationship"),
        authorizedToAct: bool(fields, "authorizedToAct") ?? false,
      };
      const missing = (["name", "email", "phone"] as const).filter((k) => !candidate[k]);
      if (missing.length > 0) {
        return fail("clarify", `To add this person I still need their ${missing.join(", ")}.`, { missingFields: missing });
      }
      const v = validate(relatedPersonInputSchema, candidate);
      if (!v.ok) return fail("add_related_person", v.errors[0]);

      const person = await repo.addRelatedPerson(accountId, v.value);
      const queued = await notify(`Added related person ${person.name}`);
      return ok("add_related_person", `I've added ${person.name}${person.authorizedToAct ? " as an authorized representative" : ""}.`, { notificationQueued: queued });
    }

    // ---- promise to pay ----------------------------------------------------
    case "create_promise_to_pay": {
      const amountCents = num(fields, "amountCents");
      const dueDate = str(fields, "dueDate");
      const missing: string[] = [];
      if (!amountCents) missing.push("amount");
      if (!dueDate) missing.push("dueDate");
      if (missing.length > 0) {
        return fail("clarify", `To set up a promise to pay I need the ${missing.join(" and ")}.`, { missingFields: missing });
      }
      if (amountCents! <= 0) return fail("create_promise_to_pay", "The amount must be greater than zero.");
      if (!isFutureDate(dueDate!, deps.now())) {
        return fail("create_promise_to_pay", "A promise to pay must have a future due date.");
      }
      const promise = await repo.createPromiseToPay(accountId, { amountCents: amountCents!, dueDate: dueDate! });
      const queued = await notify("Created a promise to pay");
      return ok("create_promise_to_pay", `Got it — I've recorded a promise to pay ${promise.amountCents / 100} ${promise.currency} on ${promise.dueDate}.`, { promiseToPay: promise, notificationQueued: queued });
    }

    // ---- mocked payment ----------------------------------------------------
    case "mock_payment": {
      const amountCents = num(fields, "amountCents");
      if (!amountCents) return fail("clarify", "How much would you like to pay?", { missingFields: ["amount"] });
      if (amountCents <= 0) return fail("mock_payment", "The payment amount must be greater than zero.");
      if (amountCents > context.account.balanceCents) {
        return fail("mock_payment", `That's more than your balance of ${context.account.balanceCents / 100} ${context.account.currency}. Try an amount up to your balance.`);
      }
      const { transaction, account } = await repo.recordPayment(accountId, {
        amountCents,
        idempotencyKey: str(fields, "idempotencyKey"),
      });
      const queued = await notify(`Recorded a payment of ${amountCents / 100} ${context.account.currency}`);
      return ok("mock_payment", `Payment of ${amountCents / 100} ${account.account.currency} taken using the card on file. Your new balance is ${account.account.balanceCents / 100} ${account.account.currency}.`, { transaction, account, notificationQueued: queued });
    }

    // ---- call appointment --------------------------------------------------
    case "book_call_appointment": {
      const scheduledAt = str(fields, "scheduledAt");
      if (!scheduledAt) return fail("clarify", "When would you like the call? Please give a day and time.", { missingFields: ["scheduledAt"] });
      if (!isFutureDate(scheduledAt, deps.now())) {
        return fail("book_call_appointment", "That time is in the past. Please pick a future date and time.");
      }
      const appointment = await repo.bookCallAppointment(accountId, {
        scheduledAt,
        phone: str(fields, "phone") ?? context.account.phone,
        reason: str(fields, "reason"),
      });
      const queued = await notify("Booked a call appointment");
      return ok("book_call_appointment", `Your call is booked for ${appointment.scheduledAt}. We'll ring ${appointment.phone}.`, { callAppointment: appointment, notificationQueued: queued });
    }

    // ---- fallbacks ---------------------------------------------------------
    case "clarify":
      return fail("clarify", "I want to make sure I get this right — could you give me a little more detail?");
    default:
      return fail("unsupported", "I can help with your account details, related people, promises to pay, payments, transactions, and call bookings. What would you like to do?");
  }
}
