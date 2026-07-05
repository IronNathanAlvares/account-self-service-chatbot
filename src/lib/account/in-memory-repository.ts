import standardFixture from "../../../fixtures/debtor-standard.json";
import {
  normalizeLegacyFixture,
  type AccountContext,
  type CallAppointment,
  type LegacyAccountFixture,
  type PromiseToPay,
  type RelatedPerson,
  type Transaction,
} from "@/lib/account/types";
import type {
  AccountHolderPatch,
  AccountRepository,
  AppointmentInput,
  PaymentInput,
  PromiseInput,
} from "@/lib/account/repository";
import type { RelatedPersonInput } from "@/lib/chat/validation/validators";

// In-memory repository used by unit tests and as a zero-config local dev
// fallback when Supabase env vars are not set. Deterministic and side-effect
// free apart from its own internal state.

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function newId(prefix: string): string {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  return `${prefix}_${rand}`;
}

export class InMemoryAccountRepository implements AccountRepository {
  private store = new Map<string, AccountContext>();
  private seenIdempotencyKeys = new Map<string, Transaction>();

  constructor(seed: AccountContext[] = [defaultSeed()]) {
    for (const account of seed) {
      this.store.set(account.account.accountId, clone(account));
    }
  }

  private require(accountId: string): AccountContext {
    const account = this.store.get(accountId);
    if (!account) throw new Error(`Unknown account: ${accountId}`);
    return account;
  }

  async getAccountContext(accountId: string): Promise<AccountContext | null> {
    const account = this.store.get(accountId);
    return account ? clone(account) : null;
  }

  async updateAccountHolder(
    accountId: string,
    patch: AccountHolderPatch,
  ): Promise<AccountContext> {
    const ctx = this.require(accountId);
    const a = ctx.account;
    if (patch.firstName !== undefined) a.accountHolderFirstName = patch.firstName;
    if (patch.lastName !== undefined) a.accountHolderLastName = patch.lastName;
    if (patch.email !== undefined) a.email = patch.email;
    if (patch.phone !== undefined) a.phone = patch.phone;
    if (patch.preferredContactMethod !== undefined)
      a.preferredContactMethod = patch.preferredContactMethod;
    if (patch.address !== undefined) a.address = { ...a.address, ...patch.address };
    return clone(ctx);
  }

  async addRelatedPerson(
    accountId: string,
    input: RelatedPersonInput,
  ): Promise<RelatedPerson> {
    const ctx = this.require(accountId);
    const person: RelatedPerson = {
      id: newId("rel"),
      name: input.name,
      email: input.email,
      phone: input.phone,
      relationship: input.relationship,
      authorizedToAct: input.authorizedToAct,
    };
    ctx.relatedPeople.push(person);
    return clone(person);
  }

  async updateRelatedPerson(
    accountId: string,
    relatedPersonId: string,
    patch: Partial<RelatedPersonInput>,
  ): Promise<RelatedPerson> {
    const ctx = this.require(accountId);
    const person = ctx.relatedPeople.find((p) => p.id === relatedPersonId);
    if (!person) throw new Error(`Unknown related person: ${relatedPersonId}`);
    Object.assign(person, patch);
    return clone(person);
  }

  async removeRelatedPerson(
    accountId: string,
    relatedPersonId: string,
  ): Promise<void> {
    const ctx = this.require(accountId);
    ctx.relatedPeople = ctx.relatedPeople.filter((p) => p.id !== relatedPersonId);
  }

  async createPromiseToPay(
    accountId: string,
    input: PromiseInput,
  ): Promise<PromiseToPay> {
    const ctx = this.require(accountId);
    const promise: PromiseToPay = {
      id: newId("ptp"),
      amountCents: input.amountCents,
      currency: ctx.account.currency,
      dueDate: input.dueDate,
      status: "active",
      createdAt: new Date().toISOString(),
    };
    ctx.promisesToPay.push(promise);
    return clone(promise);
  }

  async recordPayment(
    accountId: string,
    input: PaymentInput,
  ): Promise<{ transaction: Transaction; account: AccountContext }> {
    const ctx = this.require(accountId);

    if (input.idempotencyKey) {
      const existing = this.seenIdempotencyKeys.get(input.idempotencyKey);
      if (existing) return { transaction: clone(existing), account: clone(ctx) };
    }

    const transaction: Transaction = {
      id: newId("txn"),
      type: "payment",
      status: "completed",
      amountCents: input.amountCents,
      currency: ctx.account.currency,
      description: "Mocked card payment",
      transactionDate: new Date().toISOString().slice(0, 10),
    };
    ctx.transactions.push(transaction);
    ctx.account.balanceCents = Math.max(
      0,
      ctx.account.balanceCents - input.amountCents,
    );

    if (input.idempotencyKey) {
      this.seenIdempotencyKeys.set(input.idempotencyKey, transaction);
    }
    return { transaction: clone(transaction), account: clone(ctx) };
  }

  async bookCallAppointment(
    accountId: string,
    input: AppointmentInput,
  ): Promise<CallAppointment> {
    const ctx = this.require(accountId);
    const appointment: CallAppointment = {
      id: newId("call"),
      scheduledAt: input.scheduledAt,
      phone: input.phone,
      reason: input.reason,
      status: "scheduled",
    };
    ctx.callAppointments.push(appointment);
    return clone(appointment);
  }
}

export function defaultSeed(): AccountContext {
  return normalizeLegacyFixture(standardFixture as LegacyAccountFixture);
}
