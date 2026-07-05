import { createServerSupabaseClient } from "@/lib/supabase/server-client";

// Reads the audit trail (account_change_events) that every mutation writes.
// Powers the "Activity" view so a reviewer can see what changed and why.

export type AccountChangeEvent = {
  id: string;
  action: string;
  changedBy: string;
  summary: string;
  before: unknown;
  after: unknown;
  createdAt: string;
};

type Row = Record<string, unknown>;
const s = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));

export async function listChangeEvents(
  accountId: string,
  limit = 50,
): Promise<AccountChangeEvent[]> {
  const db = createServerSupabaseClient();
  if (!db) return [];

  const { data: acct } = await db
    .from("account_holders")
    .select("id")
    .eq("account_id", accountId)
    .maybeSingle();
  if (!acct) return [];

  const { data } = await db
    .from("account_change_events")
    .select("*")
    .eq("account_holder_id", s((acct as Row).id))
    .order("created_at", { ascending: false })
    .limit(limit);

  return ((data ?? []) as Row[]).map((r) => ({
    id: s(r.id),
    action: s(r.action),
    changedBy: s(r.changed_by),
    summary: s(r.summary),
    before: r.before ?? null,
    after: r.after ?? null,
    createdAt: s(r.created_at),
  }));
}
