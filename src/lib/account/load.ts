import { InMemoryAccountRepository, defaultSeed } from "@/lib/account/in-memory-repository";
import type { AccountContext } from "@/lib/account/types";
import { SupabaseAccountRepository } from "@/lib/account/supabase-repository";
import { createServerSupabaseClient } from "@/lib/supabase/server-client";

// Server-side account loader. Uses Supabase when configured, otherwise falls
// back to the seeded in-memory account so the app renders with zero config.

export async function loadAccountContext(accountId: string): Promise<AccountContext> {
  const db = createServerSupabaseClient();
  const repo = db
    ? new SupabaseAccountRepository(db)
    : new InMemoryAccountRepository();

  const ctx = await repo.getAccountContext(accountId);
  return ctx ?? defaultSeed();
}
