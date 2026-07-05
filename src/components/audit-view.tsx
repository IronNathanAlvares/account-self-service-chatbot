"use client";

import { useCallback, useEffect, useState } from "react";
import { History, RefreshCw } from "lucide-react";

import type { AccountChangeEvent } from "@/lib/account/audit";
import { cn } from "@/lib/utils";

// Explainability timeline: shows every persisted change (from
// account_change_events) so a reviewer can inspect what happened and why.

const ACTION_LABELS: Record<string, string> = {
  update_account_holder: "Account details updated",
  update_preferred_contact_method: "Preferred contact updated",
  add_related_person: "Related person added",
  update_related_person: "Related person updated",
  remove_related_person: "Related person removed",
  create_promise_to_pay: "Promise to pay created",
  mock_payment: "Payment recorded",
  book_call_appointment: "Call appointment booked",
};

export function AuditView({ accountId }: { accountId: string }) {
  const [events, setEvents] = useState<AccountChangeEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/audit?accountId=${encodeURIComponent(accountId)}`);
      if (res.ok) {
        const body = (await res.json()) as { events: AccountChangeEvent[] };
        setEvents(body.events);
      }
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-6 overflow-y-auto pr-1">
      <section className="rounded-[1.5rem] border border-white/75 bg-white/78 p-6 shadow-[0_24px_60px_rgba(15,23,42,0.08)] backdrop-blur-sm sm:p-8">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.22em] text-slate-500">Activity</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">Change history</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Every change the assistant makes is recorded here with a before/after
              snapshot — a full audit trail of what happened and why.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex h-10 items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-4 text-sm font-medium text-slate-600 transition hover:bg-white"
          >
            <RefreshCw className={cn("size-4", loading && "animate-spin")} /> Refresh
          </button>
        </div>

        <div className="mt-7">
          {events.length === 0 ? (
            <div className="rounded-[1rem] border border-dashed border-slate-300 bg-slate-50/70 p-6 text-center text-sm text-slate-500">
              {loading
                ? "Loading activity…"
                : "No changes yet. Update a detail or make a payment in the chat and it will appear here. (Requires Supabase to be configured.)"}
            </div>
          ) : (
            <ol className="relative space-y-4 border-l border-slate-200 pl-6">
              {events.map((event) => (
                <li key={event.id} className="relative">
                  <span className="absolute -left-[27px] top-1.5 size-3 rounded-full border-2 border-white bg-[#2b4c8c] shadow" />
                  <div className="rounded-[1rem] border border-slate-200/75 bg-slate-50/75 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-900">
                        {ACTION_LABELS[event.action] ?? event.action}
                      </p>
                      <time className="text-xs text-slate-500">
                        {new Date(event.createdAt).toLocaleString("en-IE")}
                      </time>
                    </div>
                    <p className="mt-1 text-sm text-slate-600">{event.summary}</p>
                    {event.before || event.after ? (
                      <>
                        <button
                          type="button"
                          onClick={() => setOpenId(openId === event.id ? null : event.id)}
                          className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-[#2b4c8c] hover:underline"
                        >
                          <History className="size-3.5" />
                          {openId === event.id ? "Hide" : "Show"} before / after
                        </button>
                        {openId === event.id ? (
                          <div className="mt-2 grid gap-2 sm:grid-cols-2">
                            <JsonBlock title="Before" value={event.before} />
                            <JsonBlock title="After" value={event.after} />
                          </div>
                        ) : null}
                      </>
                    ) : null}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      </section>
    </div>
  );
}

function JsonBlock({ title, value }: { title: string; value: unknown }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">{title}</p>
      <pre className="max-h-40 overflow-auto text-[11px] leading-5 text-slate-600">
        {value ? JSON.stringify(value, null, 2) : "—"}
      </pre>
    </div>
  );
}
