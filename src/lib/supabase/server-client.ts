import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Server-only Supabase client. Uses the SERVICE ROLE key so /api/chat can write
// account data. This key must NEVER be exposed to the browser: no NEXT_PUBLIC_
// prefix, and this module must only be imported from server code.

export function createServerSupabaseClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    return null;
  }

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
