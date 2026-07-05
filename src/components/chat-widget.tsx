"use client";

import {
  KeyboardEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { Bot, SendHorizonal, Sparkles, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { AccountContext } from "@/lib/account/types";
import type { ChatResponse } from "@/lib/chat/types";
import { cn } from "@/lib/utils";

type ChatMessage = {
  id: string;
  role: "customer" | "agent";
  content: string;
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

      setMessages((m) => [...m, { id: `a-${sentAt + 1}`, role: "agent", content: reply }]);

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
                <div key={m.id} className={cn("flex", m.role === "customer" ? "justify-end" : "justify-start")}>
                  <div
                    className={cn(
                      "max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-6 shadow-sm",
                      m.role === "customer"
                        ? "bg-[linear-gradient(135deg,#0f1d3d,#213a6b)] text-white"
                        : "border border-slate-200 bg-slate-50 text-slate-700",
                    )}
                  >
                    {m.content}
                  </div>
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
