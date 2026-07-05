import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Server-only Supabase client (the "admin" client that bypasses RLS). Supports
// both the new API-key format (sb_secret_... / SUPABASE_SECRET_KEY) and the legacy
// service-role JWT. This key must NEVER reach the browser: no NEXT_PUBLIC_
// prefix, and this module must only be imported from server code.

export function createServerSupabaseClient(): SupabaseClient | null {
  const url =
    process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey =
    process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !secretKey) {
    return null;
  }

  return createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
