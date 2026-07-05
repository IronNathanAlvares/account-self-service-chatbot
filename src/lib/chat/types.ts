import type {
  AccountContext,
  CallAppointment,
  PromiseToPay,
  RelatedPerson,
  Transaction,
} from "@/lib/account/types";

export type ChatRole = "account_holder" | "assistant";

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: string;
};

export type ChatAction =
  | "read_account"
  | "update_account_holder"
  | "read_preferred_contact_method"
  | "update_preferred_contact_method"
  | "add_related_person"
  | "update_related_person"
  | "remove_related_person"
  | "read_related_people"
  | "create_promise_to_pay"
  | "read_promises_to_pay"
  | "mock_payment"
  | "read_transactions"
  | "book_call_appointment"
  | "read_call_appointments"
  | "clarify"
  | "unsupported";

// Carries multi-turn state between requests so the (stateless) server can
// finish collecting details or wait for a confirmation across messages.
export type ChatPendingState = {
  action: ChatAction;
  fields: Record<string, unknown>;
  stage: "collect" | "confirm";
};

export type ChatActionResult = {
  action: ChatAction;
  success: boolean;
  reply: string;
  account?: AccountContext;
  relatedPeople?: RelatedPerson[];
  promiseToPay?: PromiseToPay;
  promisesToPay?: PromiseToPay[];
  transaction?: Transaction;
  transactions?: Transaction[];
  callAppointment?: CallAppointment;
  callAppointments?: CallAppointment[];
  missingFields?: string[];
  notificationQueued?: boolean;
  /** When set, the client should keep this and send it with the next message. */
  pending?: ChatPendingState;
  /** When true, the client should show Yes/No confirm buttons. */
  requiresConfirmation?: boolean;
};

export type ChatRequest = {
  accountId: string;
  message: string;
  conversationId?: string;
  pending?: ChatPendingState;
};

export type ChatResponse = {
  conversationId: string;
  message: ChatMessage;
  result: ChatActionResult;
};
