import type {
  AccountContext,
  CallAppointment,
  PromiseToPay,
  RelatedPerson,
  Transaction,
} from "@/lib/account/types";
import type { RelatedPersonInput, AddressInput } from "@/lib/chat/validation/validators";

// The single seam between business logic and persistence. The action router
// depends only on this interface, so it can be tested with an in-memory fake
// and run in production against Supabase.

export type AccountHolderPatch = Partial<{
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: AddressInput;
  preferredContactMethod: "email" | "sms" | "phone";
}>;

export type PaymentInput = {
  amountCents: number;
  /** Guards against double-charging a retried request. */
  idempotencyKey?: string;
};

export type PromiseInput = {
  amountCents: number;
  dueDate: string; // ISO date
};

export type AppointmentInput = {
  scheduledAt: string; // ISO datetime
  phone: string;
  reason?: string;
};

export interface AccountRepository {
  getAccountContext(accountId: string): Promise<AccountContext | null>;

  updateAccountHolder(
    accountId: string,
    patch: AccountHolderPatch,
  ): Promise<AccountContext>;

  addRelatedPerson(
    accountId: string,
    input: RelatedPersonInput,
  ): Promise<RelatedPerson>;

  updateRelatedPerson(
    accountId: string,
    relatedPersonId: string,
    patch: Partial<RelatedPersonInput>,
  ): Promise<RelatedPerson>;

  removeRelatedPerson(accountId: string, relatedPersonId: string): Promise<void>;

  createPromiseToPay(
    accountId: string,
    input: PromiseInput,
  ): Promise<PromiseToPay>;

  /** Records a completed payment transaction AND deducts the balance atomically. */
  recordPayment(
    accountId: string,
    input: PaymentInput,
  ): Promise<{ transaction: Transaction; account: AccountContext }>;

  bookCallAppointment(
    accountId: string,
    input: AppointmentInput,
  ): Promise<CallAppointment>;
}
