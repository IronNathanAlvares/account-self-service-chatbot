"use client";

import {
  KeyboardEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  Bot,
  CalendarClock,
  CheckCircle2,
  HandCoins,
  Receipt,
  RotateCcw,
  SendHorizonal,
  Sparkles,
  UserPlus,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import type { AccountContext } from "@/lib/account/types";
import type { ChatActionResult, ChatResponse } from "@/lib/chat/types";
import { formatCents } from "@/lib/money";
import { cn } from "@/lib/utils";

type ChatMessage = {
  id: string;
  role: "customer" | "agent";
  content: string;
  result?: ChatActionResult;
};

const SUGGESTIONS = [
  "What's my balance?",
  "Show my transactions",
  "Pay 150 euro now",
  "Book a call next Tuesday at 10am",
];

export function ChatWidget({
  accountId,
  onAccountUpdate,
}: {
  accountId: string;
  onAccountUpdate?: (account: AccountContext) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, open]);

  const send = async (text: string) => {
    const message = text.trim();
    if (!message || isSending) return;

    const sentAt = Date.now();
    setMessages((m) => [...m, { id: `c-${sentAt}`, role: "customer", content: message }]);
    setDraft("");
    setIsSending(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId, message }),
      });
      const body = (await response.json()) as ChatResponse | { error?: string };
      const reply =
        "message" in body
          ? body.message.content
          : body.error ?? "The assistant did not return a usable response.";
      const result = "result" in body ? body.result : undefined;

      setMessages((m) => [...m, { id: `a-${sentAt + 1}`, role: "agent", content: reply, result }]);

      // Live-refresh the dashboard from persisted state after any successful action.
      if ("result" in body && body.result?.success && onAccountUpdate) {
        const refreshed = await fetch(`/api/account?accountId=${encodeURIComponent(accountId)}`);
        if (refreshed.ok) {
          const ctx = (await refreshed.json()) as AccountContext;
          onAccountUpdate(ctx);
        }
      }
    } catch {
      setMessages((m) => [
        ...m,
        { id: `a-${sentAt + 1}`, role: "agent", content: "The chat service could not be reached." },
      ]);
    } finally {
      setIsSending(false);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void send(draft);
    }
  };

  return (
    <>
      {/* Floating launcher */}
      <button
        type="button"
        aria-label={open ? "Close assistant" : "Open assistant"}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "fixed bottom-6 right-6 z-50 flex size-16 items-center justify-center rounded-full text-white shadow-[0_18px_40px_rgba(15,29,61,0.45)] transition-transform duration-300 hover:scale-105",
          "bg-[linear-gradient(135deg,#0f1d3d,#2b4c8c)]",
        )}
      >
        <span className="absolute inline-flex size-16 animate-ping rounded-full bg-[#2b4c8c] opacity-20" />
        {open ? <X className="size-6" /> : <Bot className="size-7" />}
      </button>

      {/* Chat panel */}
      <div
        className={cn(
          "fixed bottom-28 right-6 z-50 flex w-[min(94vw,400px)] flex-col overflow-hidden rounded-[1.75rem] border border-slate-200/80 bg-white/95 shadow-[0_28px_80px_rgba(15,23,42,0.28)] backdrop-blur-md transition-all duration-300",
          open ? "pointer-events-auto translate-y-0 opacity-100" : "pointer-events-none translate-y-4 opacity-0",
        )}
        style={{ height: "min(70vh, 560px)" }}
      >
        <div className="flex items-center gap-3 border-b border-slate-200/80 bg-[linear-gradient(135deg,#0f1d3d,#15294f)] px-5 py-4 text-white">
          <div className="flex size-10 items-center justify-center rounded-full bg-white/15">
            <Bot className="size-5" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold">Account Assistant</p>
            <p className="flex items-center gap-1 text-xs text-white/70">
              <span className="size-2 rounded-full bg-emerald-400" /> Online
            </p>
          </div>
          <button
            type="button"
            onClick={() => setMessages([])}
            title="Start a new conversation"
            className="ml-auto flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium text-white/80 transition hover:bg-white/20"
          >
            <RotateCcw className="size-3.5" /> New
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center px-2 text-center">
              <div className="flex size-12 items-center justify-center rounded-full bg-slate-100 text-slate-600">
                <Sparkles className="size-5" />
              </div>
              <p className="mt-3 text-sm font-medium text-slate-800">How can I help with your account?</p>
              <p className="mt-1 text-xs text-slate-500">Try one of these:</p>
              <div className="mt-3 flex flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => void send(s)}
                    className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-600 transition hover:border-slate-300 hover:bg-white"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={cn("flex flex-col gap-2", m.role === "customer" ? "items-end" : "items-start")}
                >
                  <div
                    className={cn(
                      "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-6 shadow-sm",
                      m.role === "customer"
                        ? "bg-[linear-gradient(135deg,#0f1d3d,#213a6b)] text-white"
                        : "border border-slate-200 bg-slate-50 text-slate-700",
                    )}
                  >
                    {m.content}
                  </div>
                  {m.role === "agent" && m.result ? <ActionCard result={m.result} /> : null}
                </div>
              ))}
              {isSending ? (
                <div className="flex justify-start">
                  <div className="flex gap-1 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <span className="size-2 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.2s]" />
                    <span className="size-2 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.1s]" />
                    <span className="size-2 animate-bounce rounded-full bg-slate-400" />
                  </div>
                </div>
              ) : null}
              <div ref={endRef} />
            </div>
          )}
        </div>

        <div className="border-t border-slate-200/80 bg-white p-3">
          <div className="flex items-end gap-2 rounded-2xl border border-slate-200 bg-white p-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKeyDown}
              rows={1}
              placeholder="Message the assistant..."
              className="max-h-28 min-h-9 w-full resize-none border-0 bg-transparent px-2 py-1.5 text-sm text-slate-900 outline-none placeholder:text-slate-400"
            />
            <Button
              type="button"
              onClick={() => void send(draft)}
              disabled={!draft.trim() || isSending}
              className="size-9 shrink-0 rounded-full bg-[linear-gradient(135deg,#0f1d3d,#2b4c8c)] p-0 text-white hover:opacity-90"
            >
              <SendHorizonal className="size-4" />
            </Button>
          </div>
          <p className="mt-1.5 px-1 text-[10px] text-slate-400">Enter to send · Shift+Enter for a new line</p>
        </div>
      </div>
    </>
  );
}

// Renders a rich card for a structured action result (receipt, promise, etc.).
function ActionCard({ result }: { result: ChatActionResult }) {
  if (result.transaction) {
    const t = result.transaction;
    return (
      <Card icon={Receipt} tone="emerald" title="Payment receipt">
        <Row label="Amount" value={formatCents(t.amountCents, t.currency)} strong />
        <Row label="Status" value={t.status} />
        <Row label="Date" value={t.transactionDate} />
        {result.account ? (
          <Row label="New balance" value={formatCents(result.account.account.balanceCents, result.account.account.currency)} strong />
        ) : null}
      </Card>
    );
  }

  if (result.promiseToPay) {
    const p = result.promiseToPay;
    return (
      <Card icon={HandCoins} tone="indigo" title="Promise to pay">
        <Row label="Amount" value={formatCents(p.amountCents, p.currency)} strong />
        <Row label="Due" value={p.dueDate} />
        <Row label="Status" value={p.status} />
      </Card>
    );
  }

  if (result.callAppointment) {
    const c = result.callAppointment;
    return (
      <Card icon={CalendarClock} tone="indigo" title="Call booked">
        <Row label="When" value={new Date(c.scheduledAt).toLocaleString("en-IE")} strong />
        <Row label="Phone" value={c.phone} />
        {c.reason ? <Row label="Reason" value={c.reason} /> : null}
      </Card>
    );
  }

  if (result.action === "add_related_person" && result.success) {
    return (
      <Card icon={UserPlus} tone="emerald" title="Person added">
        <p className="text-xs text-slate-500">A notification with the encrypted PDF has been sent.</p>
      </Card>
    );
  }

  if (result.relatedPeople && result.relatedPeople.length > 0) {
    return (
      <Card icon={UserPlus} tone="slate" title={`Related people (${result.relatedPeople.length})`}>
        {result.relatedPeople.map((person) => (
          <Row key={person.id} label={person.name} value={person.authorizedToAct ? "Authorized" : "Not authorized"} />
        ))}
      </Card>
    );
  }

  if ((result.action === "update_account_holder" || result.action === "update_preferred_contact_method") && result.success) {
    return (
      <Card icon={CheckCircle2} tone="emerald" title="Change saved">
        <p className="text-xs text-slate-500">Updated and a notification email with the encrypted PDF was queued.</p>
      </Card>
    );
  }

  return null;
}

const TONES: Record<string, string> = {
  emerald: "border-emerald-200 bg-emerald-50",
  indigo: "border-indigo-200 bg-indigo-50",
  slate: "border-slate-200 bg-slate-50",
};

function Card({
  icon: Icon,
  tone,
  title,
  children,
}: {
  icon: typeof Receipt;
  tone: keyof typeof TONES | string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("w-[85%] rounded-2xl border p-3 shadow-sm", TONES[tone] ?? TONES.slate)}>
      <div className="mb-2 flex items-center gap-2 text-slate-800">
        <Icon className="size-4" />
        <span className="text-xs font-semibold uppercase tracking-wide">{title}</span>
      </div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-slate-500">{label}</span>
      <span className={cn("text-right", strong ? "font-semibold text-slate-900" : "text-slate-700")}>{value}</span>
    </div>
  );
}
