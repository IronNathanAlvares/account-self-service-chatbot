import { listChangeEvents } from "@/lib/account/audit";
import type { AccountHolder, CallAppointment, PromiseToPay, RelatedPerson } from "@/lib/account/types";
import type { RouterDeps } from "@/lib/chat/router/action-router";
import type { ChatActionResult } from "@/lib/chat/types";

// "Undo that" - reverts the most recent change using the audit trail. Because
// payments here are mocked, undo can safely restore the balance; in a real
// system a refund would require verification. Requires the Supabase-backed
// repository (the audit trail lives in the database).

export async function undoLastChange(accountId: string, deps: RouterDeps): Promise<ChatActionResult> {
  const [event] = await listChangeEvents(accountId, 1);
  if (!event) {
    return { action: "clarify", success: false, reply: "There's nothing to undo yet." };
  }

  const notify = async (summary: string): Promise<boolean> => {
    const snapshot = await deps.repo.getAccountContext(accountId);
    if (!snapshot) return false;
    const r = await deps.notifier.send({
      accountId,
      changedBy: "account_holder",
      changeSummary: summary,
      accountSnapshot: snapshot,
      subject: "A recent change on your account was reverted",
    });
    return r.sent || r.notificationId.length > 0;
  };

  const done = async (reply: string, summary: string): Promise<ChatActionResult> => {
    const account = (await deps.repo.getAccountContext(accountId)) ?? undefined;
    const queued = await notify(summary);
    return { action: "clarify", success: true, reply, account, notificationQueued: queued };
  };

  switch (event.action) {
    case "update_account_holder": {
      const before = event.before as AccountHolder | null;
      if (!before) break;
      await deps.repo.updateAccountHolder(accountId, {
        firstName: before.accountHolderFirstName,
        lastName: before.accountHolderLastName,
        email: before.email,
        phone: before.phone,
        address: before.address,
        preferredContactMethod: before.preferredContactMethod,
      });
      return done("Done - I've reverted your most recent account detail change.", "Reverted an account detail change");
    }

    case "add_related_person": {
      const person = event.after as RelatedPerson | null;
      if (!person?.id) break;
      await deps.repo.removeRelatedPerson(accountId, person.id);
      return done(`Done - I've removed ${person.name}, undoing the last change.`, "Reverted adding a person");
    }

    case "update_related_person": {
      const before = event.before as RelatedPerson | null;
      if (!before?.id) break;
      await deps.repo.updateRelatedPerson(accountId, before.id, {
        name: before.name,
        email: before.email,
        phone: before.phone,
        relationship: before.relationship,
        authorizedToAct: before.authorizedToAct,
      });
      return done(`Done - I've restored ${before.name}'s previous details.`, "Reverted a person update");
    }

    case "remove_related_person": {
      const before = event.before as RelatedPerson | null;
      if (!before?.name) break;
      await deps.repo.addRelatedPerson(accountId, {
        name: before.name,
        email: before.email,
        phone: before.phone,
        relationship: before.relationship,
        authorizedToAct: before.authorizedToAct,
      });
      return done(`Done - I've added ${before.name} back to your account.`, "Reverted removing a person");
    }

    case "create_promise_to_pay": {
      const promise = event.after as PromiseToPay | null;
      if (!promise?.id) break;
      await deps.repo.deletePromiseToPay(accountId, promise.id);
      return done("Done - I've cancelled that promise to pay.", "Reverted a promise to pay");
    }

    case "book_call_appointment": {
      const appointment = event.after as CallAppointment | null;
      if (!appointment?.id) break;
      await deps.repo.deleteCallAppointment(accountId, appointment.id);
      return done("Done - I've cancelled that call appointment.", "Reverted a call appointment");
    }

    case "mock_payment": {
      const after = event.after as { transactionId?: string } | null;
      if (!after?.transactionId) break;
      await deps.repo.reversePayment(accountId, after.transactionId);
      return done("Done - I've reversed that payment and restored your balance.", "Reversed a payment");
    }
  }

  return {
    action: "clarify",
    success: false,
    reply: "There's nothing I can undo from the last change.",
  };
}
