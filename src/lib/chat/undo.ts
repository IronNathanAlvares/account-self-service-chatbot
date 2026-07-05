import { listChangeEvents } from "@/lib/account/audit";
import type { AccountHolder, RelatedPerson } from "@/lib/account/types";
import type { RouterDeps } from "@/lib/chat/router/action-router";
import type { ChatActionResult } from "@/lib/chat/types";

// "Undo that" — reverts the most recent change using the audit trail. Safe by
// design: only non-financial changes with a recoverable snapshot are undone;
// anything else (payments, etc.) is declined with an explanation. Requires the
// Supabase-backed repository (the audit trail lives in the database).

export async function undoLastChange(accountId: string, deps: RouterDeps): Promise<ChatActionResult> {
  const [event] = await listChangeEvents(accountId, 1);
  if (!event) {
    return { action: "clarify", success: false, reply: "There's nothing to undo yet." };
  }

  const notify = async (summary: string): Promise<boolean> => {
    const snapshot = await deps.repo.getAccountContext(accountId);
    if (!snapshot) return false;
    const r = await deps.notifier.send({ accountId, changedBy: "account_holder", changeSummary: summary, accountSnapshot: snapshot });
    return r.sent || r.notificationId.length > 0;
  };

  if (event.action === "update_account_holder" && event.before) {
    const before = event.before as AccountHolder;
    await deps.repo.updateAccountHolder(accountId, {
      firstName: before.accountHolderFirstName,
      lastName: before.accountHolderLastName,
      email: before.email,
      phone: before.phone,
      preferredContactMethod: before.preferredContactMethod,
      address: before.address,
    });
    const account = (await deps.repo.getAccountContext(accountId)) ?? undefined;
    const queued = await notify("Reverted the last account detail change");
    return { action: "update_account_holder", success: true, reply: "Done — I've reverted your most recent account detail change.", account, notificationQueued: queued };
  }

  if (event.action === "add_related_person" && event.after) {
    const person = event.after as RelatedPerson;
    if (person.id) {
      await deps.repo.removeRelatedPerson(accountId, person.id);
      const queued = await notify(`Removed ${person.name} (undo of add)`);
      return { action: "remove_related_person", success: true, reply: `Done — I've removed ${person.name}, undoing the last change.`, notificationQueued: queued };
    }
  }

  return {
    action: "clarify",
    success: false,
    reply: `I can't automatically undo the last change (${event.action}). You can make the change directly instead.`,
  };
}
