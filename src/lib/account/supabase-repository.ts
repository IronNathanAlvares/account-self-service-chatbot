import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  AccountContext,
  AccountHolder,
  CallAppointment,
  PromiseToPay,
  RelatedPerson,
  Transaction,
} from "@/lib/account/types";
import type {
  AccountHolderPatch,
  AccountRepository,
  AppointmentInput,
  PaymentInput,
  PromiseInput,
} from "@/lib/account/repository";
import type { RelatedPersonInput } from "@/lib/chat/validation/validators";

// Production repository backed by Supabase/Postgres. The dynamic records
// (account, people, promises, transactions, calls) come from the DB; the
// read-only starter context (billing due date, support, payment options) is
// synthesized from constants so the AccountContext shape stays complete.

type Row = Record<string, unknown>;

const s = (v: unknown): string => (typeof v === "string" ? v : v == null ? "" : String(v));
const n = (v: unknown): number => (typeof v === "number" ? v : Number(v) || 0);
const b = (v: unknown): boolean => v === true;

export class SupabaseAccountRepository implements AccountRepository {
  constructor(private readonly db: SupabaseClient) {}

  private async holderId(accountId: string): Promise<string> {
    const { data, error } = await this.db
      .from("account_holders")
      .select("id")
      .eq("account_id", accountId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error(`Unknown account: ${accountId}`);
    return s((data as Row).id);
  }

  private async recordEvent(
    holderId: string,
    action: string,
    summary: string,
    before: unknown,
    after: unknown,
  ): Promise<void> {
    await this.db.from("account_change_events").insert({
      account_holder_id: holderId,
      action,
      summary,
      before: before ?? null,
      after: after ?? null,
    });
  }

  async getAccountContext(accountId: string): Promise<AccountContext | null> {
    const { data: acct, error } = await this.db
      .from("account_holders")
      .select("*")
      .eq("account_id", accountId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!acct) return null;

    const holderId = s((acct as Row).id);
    const [related, promises, txns, calls] = await Promise.all([
      this.db.from("related_people").select("*").eq("account_holder_id", holderId).order("created_at"),
      this.db.from("promises_to_pay").select("*").eq("account_holder_id", holderId).order("created_at"),
      this.db.from("transactions").select("*").eq("account_holder_id", holderId).order("transaction_date"),
      this.db.from("call_appointments").select("*").eq("account_holder_id", holderId).order("scheduled_at"),
    ]);

    return mapContext(
      acct as Row,
      (related.data ?? []) as Row[],
      (promises.data ?? []) as Row[],
      (txns.data ?? []) as Row[],
      (calls.data ?? []) as Row[],
    );
  }

  async updateAccountHolder(accountId: string, patch: AccountHolderPatch): Promise<AccountContext> {
    const before = await this.getAccountContext(accountId);
    const row: Row = { updated_at: new Date().toISOString() };
    if (patch.firstName !== undefined) row.first_name = patch.firstName;
    if (patch.lastName !== undefined) row.last_name = patch.lastName;
    if (patch.email !== undefined) row.email = patch.email;
    if (patch.phone !== undefined) row.phone = patch.phone;
    if (patch.preferredContactMethod !== undefined) row.preferred_contact_method = patch.preferredContactMethod;
    if (patch.address !== undefined) {
      row.address_line1 = patch.address.line1;
      row.address_line2 = patch.address.line2 ?? null;
      row.city = patch.address.city;
      row.postal_code = patch.address.postalCode;
      row.country = patch.address.country;
    }

    const { error } = await this.db.from("account_holders").update(row).eq("account_id", accountId);
    if (error) throw new Error(error.message);

    const after = await this.getAccountContext(accountId);
    if (!after) throw new Error(`Unknown account: ${accountId}`);
    await this.recordEvent(
      await this.holderId(accountId),
      "update_account_holder",
      `Updated ${Object.keys(patch).join(", ")}`,
      before?.account,
      after.account,
    );
    return after;
  }

  async addRelatedPerson(accountId: string, input: RelatedPersonInput): Promise<RelatedPerson> {
    const holderId = await this.holderId(accountId);
    const { data, error } = await this.db
      .from("related_people")
      .insert({
        account_holder_id: holderId,
        name: input.name,
        email: input.email,
        phone: input.phone,
        relationship: input.relationship ?? null,
        authorized_to_act: input.authorizedToAct,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    const person = mapRelated(data as Row);
    await this.recordEvent(holderId, "add_related_person", `Added ${person.name}`, null, person);
    return person;
  }

  async updateRelatedPerson(
    accountId: string,
    relatedPersonId: string,
    patch: Partial<RelatedPersonInput>,
  ): Promise<RelatedPerson> {
    const holderId = await this.holderId(accountId);
    const row: Row = {};
    if (patch.name !== undefined) row.name = patch.name;
    if (patch.email !== undefined) row.email = patch.email;
    if (patch.phone !== undefined) row.phone = patch.phone;
    if (patch.relationship !== undefined) row.relationship = patch.relationship;
    if (patch.authorizedToAct !== undefined) row.authorized_to_act = patch.authorizedToAct;
    row.updated_at = new Date().toISOString();

    const { data, error } = await this.db
      .from("related_people")
      .update(row)
      .eq("id", relatedPersonId)
      .eq("account_holder_id", holderId)
      .select()
      .single();
    if (error) throw new Error(error.message);
    const person = mapRelated(data as Row);
    await this.recordEvent(holderId, "update_related_person", `Updated ${person.name}`, null, person);
    return person;
  }

  async removeRelatedPerson(accountId: string, relatedPersonId: string): Promise<void> {
    const holderId = await this.holderId(accountId);
    const { error } = await this.db
      .from("related_people")
      .delete()
      .eq("id", relatedPersonId)
      .eq("account_holder_id", holderId);
    if (error) throw new Error(error.message);
    await this.recordEvent(holderId, "remove_related_person", "Removed a related person", null, null);
  }

  async createPromiseToPay(accountId: string, input: PromiseInput): Promise<PromiseToPay> {
    const holderId = await this.holderId(accountId);
    const { data, error } = await this.db
      .from("promises_to_pay")
      .insert({
        account_holder_id: holderId,
        amount_cents: input.amountCents,
        currency: "EUR",
        due_date: input.dueDate,
        status: "active",
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    const promise = mapPromise(data as Row);
    await this.recordEvent(holderId, "create_promise_to_pay", "Created a promise to pay", null, promise);
    return promise;
  }

  async recordPayment(
    accountId: string,
    input: PaymentInput,
  ): Promise<{ transaction: Transaction; account: AccountContext }> {
    const { data, error } = await this.db.rpc("record_mock_payment", {
      p_account_id: accountId,
      p_amount_cents: input.amountCents,
      p_idempotency_key: input.idempotencyKey ?? null,
    });
    if (error) throw new Error(error.message);

    const result = data as { transaction: Row; replayed?: boolean };
    const transaction = mapTxn(result.transaction);
    const account = await this.getAccountContext(accountId);
    if (!account) throw new Error(`Unknown account: ${accountId}`);
    if (!result.replayed) {
      await this.recordEvent(
        await this.holderId(accountId),
        "mock_payment",
        `Recorded payment of ${input.amountCents} cents`,
        null,
        { transactionId: transaction.id, newBalanceCents: account.account.balanceCents },
      );
    }
    return { transaction, account };
  }

  async bookCallAppointment(accountId: string, input: AppointmentInput): Promise<CallAppointment> {
    const holderId = await this.holderId(accountId);
    const { data, error } = await this.db
      .from("call_appointments")
      .insert({
        account_holder_id: holderId,
        scheduled_at: input.scheduledAt,
        phone: input.phone,
        reason: input.reason ?? null,
        status: "scheduled",
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    const appointment = mapCall(data as Row);
    await this.recordEvent(holderId, "book_call_appointment", "Booked a call appointment", null, appointment);
    return appointment;
  }
}

// --- mappers: snake_case DB rows -> camelCase domain types -----------------

function mapRelated(r: Row): RelatedPerson {
  return {
    id: s(r.id),
    name: s(r.name),
    email: s(r.email),
    phone: s(r.phone),
    relationship: r.relationship ? s(r.relationship) : undefined,
    authorizedToAct: b(r.authorized_to_act),
  };
}

function mapPromise(r: Row): PromiseToPay {
  return {
    id: s(r.id),
    amountCents: n(r.amount_cents),
    currency: s(r.currency),
    dueDate: s(r.due_date),
    status: s(r.status) as PromiseToPay["status"],
    createdAt: s(r.created_at),
  };
}

function mapTxn(r: Row): Transaction {
  return {
    id: s(r.id),
    type: s(r.type) as Transaction["type"],
    status: s(r.status) as Transaction["status"],
    amountCents: n(r.amount_cents),
    currency: s(r.currency),
    description: s(r.description),
    transactionDate: s(r.transaction_date),
  };
}

function mapCall(r: Row): CallAppointment {
  return {
    id: s(r.id),
    scheduledAt: s(r.scheduled_at),
    phone: s(r.phone),
    reason: r.reason ? s(r.reason) : undefined,
    status: s(r.status) as CallAppointment["status"],
  };
}

function mapAccount(r: Row): AccountHolder {
  return {
    accountId: s(r.account_id),
    accountHolderFirstName: s(r.first_name),
    accountHolderLastName: s(r.last_name),
    email: s(r.email),
    phone: s(r.phone),
    address: {
      line1: s(r.address_line1),
      line2: r.address_line2 ? s(r.address_line2) : undefined,
      city: s(r.city),
      postalCode: s(r.postal_code),
      country: s(r.country),
    },
    preferredContactMethod: s(r.preferred_contact_method) as AccountHolder["preferredContactMethod"],
    reference: s(r.reference),
    creditorName: s(r.creditor_name),
    currency: s(r.currency),
    balanceCents: n(r.balance_cents),
    status: s(r.status),
    daysPastDue: n(r.days_past_due),
    minimumPaymentCents: n(r.minimum_payment_cents),
    lastPaymentDate: s(r.last_payment_date),
    lastPaymentAmountCents: n(r.last_payment_amount_cents),
  };
}

function mapContext(
  acct: Row,
  related: Row[],
  promises: Row[],
  txns: Row[],
  calls: Row[],
): AccountContext {
  const account = mapAccount(acct);
  return {
    account,
    billing: {
      currentAmountCents: account.balanceCents,
      lastStatementAmountCents: account.balanceCents,
      dueDate: "2026-01-24",
    },
    paymentOptions: {
      payNowEnabled: true,
      promiseToPayEnabled: true,
      mockPaymentsEnabled: true,
      arrangementEnabled: false,
      eligibleArrangementOptions: [],
    },
    support: {
      humanSupportAvailable: true,
      supportPhone: "+35318000000",
      supportEmail: "support@example.test",
    },
    relatedPeople: related.map(mapRelated),
    promisesToPay: promises.map(mapPromise),
    transactions: txns.map(mapTxn),
    callAppointments: calls.map(mapCall),
    notificationRules: {
      sendEmailOnDataChange: true,
      pdfPasswordSource: "account_phone_last4",
    },
    faqContext: {
      recentStatementReason: "Higher winter usage and one missed direct debit",
      acceptedPaymentMethods: ["card", "bank_transfer"],
    },
  };
}
