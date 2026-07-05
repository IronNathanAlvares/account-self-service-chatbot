import type { AccountContext } from "@/lib/account/types";
import type { AccountRepository, AccountHolderPatch } from "@/lib/account/repository";
import type { ChatAction, ChatActionResult, ChatPendingState, ChatSessionMemory } from "@/lib/chat/types";
import type { ParsedIntent } from "@/lib/chat/intent/intent-types";
import { formatCents } from "@/lib/money";
import type { Notifier } from "@/lib/notifications/notifier";
import {
  contactMethodSchema,
  emailSchema,
  isFutureDate,
  phoneSchema,
  relatedPersonInputSchema,
  validate,
  type RelatedPersonInput,
} from "@/lib/chat/validation/validators";
import type { RelatedPerson } from "@/lib/account/types";

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

// Ask for more detail while remembering the action + fields gathered so far.
function needInfo(
  action: ChatAction,
  fields: Record<string, unknown>,
  reply: string,
  missingFields: string[],
): ChatActionResult {
  const pending: ChatPendingState = { action, fields, stage: "collect" };
  return { action: "clarify", success: false, reply, missingFields, pending };
}

// Find related people whose name contains the query (case-insensitive).
function matchPeople(context: AccountContext, name: string): RelatedPerson[] {
  const q = name.trim().toLowerCase();
  if (!q) return [];
  return context.relatedPeople.filter((p) => p.name.toLowerCase().includes(q));
}

// Answer the specific detail the customer asked for, not a fixed field.
function describeAccount(
  context: AccountContext,
  fields: Record<string, unknown>,
  rawMessage: string,
): string {
  const a = context.account;
  const text = `${str(fields, "readField") ?? ""} ${rawMessage}`.toLowerCase();
  const has = (...words: string[]) => words.some((w) => text.includes(w));

  const address = [a.address.line1, a.address.line2, a.address.city, a.address.postalCode, a.address.country]
    .filter(Boolean)
    .join(", ");

  if (has("email")) return `The email on your account is ${a.email}.`;
  if (has("phone", "mobile", "number")) return `The phone number on your account is ${a.phone}.`;
  if (has("address", "postal", "where i live")) return `Your address on file is ${address}.`;
  if (has("name", "who am i")) return `The name on your account is ${a.accountHolderFirstName} ${a.accountHolderLastName}.`;
  if (has("reference", "account number", "ref")) return `Your account reference is ${a.reference}.`;
  if (has("balance", "owe", "owing", "outstanding")) {
    const nudge = a.balanceCents > 0 ? " Would you like to make a payment or set up a promise to pay?" : "";
    return `Your current balance is ${formatCents(a.balanceCents, a.currency)}.${nudge}`;
  }

  return `Here's a quick summary: balance ${formatCents(a.balanceCents, a.currency)}, email ${a.email}, phone ${a.phone}. Ask me for any specific detail.`;
}

export async function handleIntent(
  accountId: string,
  intent: ParsedIntent,
  deps: RouterDeps,
  options: { confirmed?: boolean; sessionMemory?: ChatSessionMemory } = {},
): Promise<ChatActionResult> {
  const { repo, notifier } = deps;
  const { action, fields } = intent;

  const context = await repo.getAccountContext(accountId);
  if (!context) {
    return fail("unsupported", "I couldn't find that account.");
  }

  // Fetches the freshest snapshot and sends the redacted change notification.
  const notify = async (changeSummary: string, recipientOverride?: string): Promise<boolean> => {
    const snapshot = (await repo.getAccountContext(accountId)) ?? context;
    const result = await notifier.send({
      accountId,
      changedBy: "account_holder",
      changeSummary,
      accountSnapshot: snapshot,
      recipientOverride,
    });
    return result.sent || result.notificationId.length > 0;
  };

  switch (action) {
    // ---- reads (no writes, no notification) --------------------------------
    case "read_account":
      return ok("read_account", describeAccount(context, fields, intent.rawMessage), { account: context });
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
        return needInfo("update_account_holder", fields, "What would you like to change - your name, email, phone, or address?", ["field"]);
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
        return needInfo("add_related_person", fields, `To add this person I still need their ${missing.join(", ")}.`, [...missing]);
      }
      const v = validate(relatedPersonInputSchema, candidate);
      if (!v.ok) return fail("add_related_person", v.errors[0]);

      const person = await repo.addRelatedPerson(accountId, v.value);
      const queued = await notify(`Added related person ${person.name}`);
      return ok("add_related_person", `I've added ${person.name}${person.authorizedToAct ? " as an authorized representative" : ""}.`, { notificationQueued: queued });
    }

    case "update_related_person": {
      const targetName = str(fields, "relatedPersonName");
      if (!targetName) return needInfo("update_related_person", fields, "Whose details would you like to change?", ["name"]);

      const matches = matchPeople(context, targetName);
      if (matches.length === 0) return fail("update_related_person", `I couldn't find anyone called "${targetName}" on your account.`);
      if (matches.length > 1) {
        return needInfo("update_related_person", fields, `There are a few matches for "${targetName}": ${matches.map((m) => m.name).join(", ")}. Which one?`, ["name"]);
      }
      const person = matches[0];

      const patch: Partial<RelatedPersonInput> = {};
      const email = str(fields, "relatedPersonEmail");
      const phone = str(fields, "relatedPersonPhone");
      if (email !== undefined) {
        const v = validate(emailSchema, email);
        if (!v.ok) return fail("update_related_person", v.errors[0]);
        patch.email = v.value;
      }
      if (phone !== undefined) {
        const v = validate(phoneSchema, phone);
        if (!v.ok) return fail("update_related_person", v.errors[0]);
        patch.phone = v.value;
      }
      const relationship = str(fields, "relationship");
      if (relationship !== undefined) patch.relationship = relationship;
      const authorized = bool(fields, "authorizedToAct");
      if (authorized !== undefined) patch.authorizedToAct = authorized;

      if (Object.keys(patch).length === 0) {
        return needInfo("update_related_person", { ...fields, relatedPersonName: person.name }, `What would you like to change about ${person.name} - their phone, email, relationship, or authorization?`, ["field"]);
      }

      const updated = await repo.updateRelatedPerson(accountId, person.id, patch);
      const queued = await notify(`Updated related person ${person.name}: ${Object.keys(patch).join(", ")}`);
      return ok("update_related_person", `Done - I've updated ${updated.name}'s ${Object.keys(patch).join(", ")}.`, { notificationQueued: queued });
    }

    case "remove_related_person": {
      const targetName = str(fields, "relatedPersonName");
      if (!targetName) return needInfo("remove_related_person", fields, "Who would you like to remove from your account?", ["name"]);

      const matches = matchPeople(context, targetName);
      if (matches.length === 0) return fail("remove_related_person", `I couldn't find anyone called "${targetName}" on your account.`);
      if (matches.length > 1) {
        return needInfo("remove_related_person", fields, `There are a few matches for "${targetName}": ${matches.map((m) => m.name).join(", ")}. Which one should I remove?`, ["name"]);
      }
      const person = matches[0];

      if (!options.confirmed) {
        return {
          action: "remove_related_person",
          success: false,
          reply: `Just to confirm - remove ${person.name} from your account? This can't be undone from here.`,
          requiresConfirmation: true,
          pending: { action: "remove_related_person", fields: { relatedPersonName: person.name }, stage: "confirm" },
        };
      }

      await repo.removeRelatedPerson(accountId, person.id);
      const queued = await notify(`Removed related person ${person.name}`);
      return ok("remove_related_person", `I've removed ${person.name} from your account.`, { notificationQueued: queued });
    }

    // ---- promise to pay ----------------------------------------------------
    case "create_promise_to_pay": {
      const amountCents = num(fields, "amountCents");
      const dueDate = str(fields, "dueDate");
      const missing: string[] = [];
      if (!amountCents) missing.push("amount");
      if (!dueDate) missing.push("dueDate");
      if (missing.length > 0) {
        return needInfo("create_promise_to_pay", fields, `To set up a promise to pay I need the ${missing.join(" and ")}.`, missing);
      }
      if (amountCents! <= 0) return fail("create_promise_to_pay", "The amount must be greater than zero.");
      if (!isFutureDate(dueDate!, deps.now())) {
        return fail("create_promise_to_pay", "A promise to pay must have a future due date.");
      }
      const promise = await repo.createPromiseToPay(accountId, { amountCents: amountCents!, dueDate: dueDate! });
      const queued = await notify(`Created a promise to pay of ${formatCents(amountCents!, context.account.currency)} due ${dueDate}`);
      return ok("create_promise_to_pay", `Got it - I've recorded a promise to pay ${formatCents(promise.amountCents, promise.currency)} on ${promise.dueDate}.`, { promiseToPay: promise, notificationQueued: queued });
    }

    // ---- mocked payment ----------------------------------------------------
    case "mock_payment": {
      const amountCents = num(fields, "amountCents");
      if (!amountCents) return needInfo("mock_payment", fields, "How much would you like to pay?", ["amount"]);
      if (amountCents <= 0) return fail("mock_payment", "The payment amount must be greater than zero.");
      if (amountCents > context.account.balanceCents) {
        return fail("mock_payment", `That's more than your balance of ${formatCents(context.account.balanceCents, context.account.currency)}. Try an amount up to your balance.`);
      }

      // Where the receipt goes: an email given this turn, else one remembered
      // from a previous payment, else the account email.
      const remembered = options.sessionMemory?.receiptEmail;
      const givenReceipt = str(fields, "receiptEmail");
      let receiptEmail = givenReceipt ?? remembered ?? context.account.email;
      if (givenReceipt) {
        const v = validate(emailSchema, givenReceipt);
        if (!v.ok) return fail("mock_payment", "That receipt email doesn't look right - try again, or say 'yes' to use the one on file.");
        receiptEmail = v.value;
      }

      // Two-phase confirm: never take a payment without an explicit "yes".
      if (!options.confirmed) {
        const note = remembered
          ? `I'll email the receipt to ${remembered} (same as last time). Reply 'yes' to confirm, or send a new email address.`
          : `I'll email the receipt to ${receiptEmail}. Reply 'yes' to confirm, or send a different email for the receipt.`;
        return {
          action: "mock_payment",
          success: false,
          reply: `You're about to pay ${formatCents(amountCents, context.account.currency)} now using the card on file. ${note}`,
          requiresConfirmation: true,
          pending: { action: "mock_payment", fields: { amountCents, receiptEmail }, stage: "confirm" },
        };
      }

      const { transaction, account } = await repo.recordPayment(accountId, {
        amountCents,
        idempotencyKey: str(fields, "idempotencyKey"),
      });
      // Only override the email recipient when the customer chose a real receipt
      // email; the default (account email) uses the normal notification routing.
      const isCustomReceipt = receiptEmail !== context.account.email;
      const queued = await notify(`Recorded a payment of ${formatCents(amountCents, context.account.currency)}`, isCustomReceipt ? receiptEmail : undefined);
      const receiptNote = queued
        ? ` Receipt sent to ${receiptEmail}.`
        : ` (The payment went through, but the receipt email to ${receiptEmail} could not be delivered.)`;
      return ok("mock_payment", `Payment of ${formatCents(amountCents, account.account.currency)} taken using the card on file. Your new balance is ${formatCents(account.account.balanceCents, account.account.currency)}.${receiptNote}`, { transaction, account, notificationQueued: queued, sessionMemory: { receiptEmail } });
    }

    // ---- call appointment --------------------------------------------------
    case "book_call_appointment": {
      const scheduledAt = str(fields, "scheduledAt");
      if (!scheduledAt) return needInfo("book_call_appointment", fields, "When would you like the call? Please give a day and time.", ["scheduledAt"]);
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
      return fail("clarify", "I want to make sure I get this right - could you give me a little more detail?");
    default:
      return fail("unsupported", "I can help with your account details, related people, promises to pay, payments, transactions, and call bookings. What would you like to do?");
  }
}
