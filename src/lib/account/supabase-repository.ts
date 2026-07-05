/* eslint-disable @typescript-eslint/no-unused-vars -- stub signatures kept until implemented */
import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  AccountContext,
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

// Production repository backed by Supabase/Postgres.
//
// TODO(day-1): implement each method against the tables in
// supabase/migrations. Notes:
//  - getAccountContext: join account_holders + related_people + promises_to_pay
//    + transactions + call_appointments, then map snake_case -> the camelCase
//    AccountContext shape (mirror normalizeLegacyFixture).
//  - recordPayment MUST be atomic: do the balance deduction + transaction
//    insert inside a Postgres function (rpc) so concurrent pays can't race.
//  - Every mutating method should also append an account_change_events row.

const NOT_IMPLEMENTED = "SupabaseAccountRepository method not implemented yet.";

export class SupabaseAccountRepository implements AccountRepository {
  constructor(private readonly db: SupabaseClient) {}

  async getAccountContext(_accountId: string): Promise<AccountContext | null> {
    void this.db;
    throw new Error(NOT_IMPLEMENTED);
  }

  async updateAccountHolder(
    _accountId: string,
    _patch: AccountHolderPatch,
  ): Promise<AccountContext> {
    throw new Error(NOT_IMPLEMENTED);
  }

  async addRelatedPerson(
    _accountId: string,
    _input: RelatedPersonInput,
  ): Promise<RelatedPerson> {
    throw new Error(NOT_IMPLEMENTED);
  }

  async updateRelatedPerson(
    _accountId: string,
    _relatedPersonId: string,
    _patch: Partial<RelatedPersonInput>,
  ): Promise<RelatedPerson> {
    throw new Error(NOT_IMPLEMENTED);
  }

  async removeRelatedPerson(
    _accountId: string,
    _relatedPersonId: string,
  ): Promise<void> {
    throw new Error(NOT_IMPLEMENTED);
  }

  async createPromiseToPay(
    _accountId: string,
    _input: PromiseInput,
  ): Promise<PromiseToPay> {
    throw new Error(NOT_IMPLEMENTED);
  }

  async recordPayment(
    _accountId: string,
    _input: PaymentInput,
  ): Promise<{ transaction: Transaction; account: AccountContext }> {
    throw new Error(NOT_IMPLEMENTED);
  }

  async bookCallAppointment(
    _accountId: string,
    _input: AppointmentInput,
  ): Promise<CallAppointment> {
    throw new Error(NOT_IMPLEMENTED);
  }
}
