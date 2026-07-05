# Database setup (Supabase / Postgres)

The app uses **Supabase Postgres**. It's already wired into the starter, the
reviewers seeded a migration for it, and the free tier (500 MB DB, unlimited API
requests, Realtime) is plenty. Two ways to run it - do **local** for day-to-day
dev, then create a **hosted** project for the deployed app.

---

## 0. Install the Supabase CLI (Windows)

```powershell
# via Scoop (recommended on Windows)
scoop install supabase

# or via npm
npm install -g supabase

supabase --version
```

Local Supabase needs **Docker Desktop** running.

---

## 1. Local development (recommended)

From the repo root:

```powershell
# one-time: link the local project scaffolding (creates supabase/config.toml if missing)
supabase init      # say "no" if it asks to overwrite existing files

# start the local stack (Postgres, Auth, Storage, Studio) in Docker
supabase start
```

`supabase start` prints local credentials. You want these:

```
API URL:        http://127.0.0.1:54321
DB URL:         postgresql://postgres:postgres@127.0.0.1:54322/postgres
anon key:       eyJhbGciOi...          <- publishable/browser key
service_role:   eyJhbGciOi...          <- SERVER ONLY, never NEXT_PUBLIC
Studio URL:     http://127.0.0.1:54323 <- visual table browser
```

Apply the migration + seed (the starter file already inserts Jane Murphy):

```powershell
# resets the local DB and re-runs everything in supabase/migrations
supabase db reset
```

Put the local values in `.env.local` (see section 3), then `pnpm dev`.

Useful:

```powershell
supabase status         # show URLs/keys again
supabase stop           # shut the stack down
supabase migration new add_audit_and_conversations   # scaffold a new migration
```

---

## 2. Hosted project (for the Vercel deploy)

1. Create a project at [supabase.com](https://supabase.com/dashboard) (free tier).
2. Get keys from **Project Settings → API**: the Project URL, the `anon`
   (publishable) key, and the `service_role` key.
3. Push your migrations to it:

   ```powershell
   supabase link --project-ref <your-project-ref>
   supabase db push
   ```

4. Add the same env vars to **Vercel → Project → Settings → Environment
   Variables** (see section 3). Redeploy.

---

## 3. Environment variables

`.env.local` (never commit real values - `.env*.local` is already gitignored):

```bash
# Browser client (safe to expose)
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<anon key>

# Server-only client used by /api/chat for writes. NO NEXT_PUBLIC prefix.
SUPABASE_SERVICE_ROLE_KEY=<service_role key>

# Email + LLM (optional locally - app falls back to logging + rule parser)
RESEND_API_KEY=re_...
NOTIFICATION_FROM_EMAIL=Account Portal <notifications@yourdomain>
ANTHROPIC_API_KEY=sk-ant-...
```

> The scaffold already reads `SUPABASE_SERVICE_ROLE_KEY` in
> `src/lib/supabase/server-client.ts`. If neither Supabase nor Resend keys are
> set, the app runs on an in-memory repository and a logging notifier, so
> `pnpm dev` works with zero config.

---

## 4. Schema notes / what to add

The starter migration (`supabase/migrations/20260630123000_account_chat_starter.sql`)
gives you 7 tables. Planned additions (see the ERD in `docs/diagrams/`):

- **`account_change_events`** - `before`/`after` JSONB per write. Powers the
  audit view and an undo feature.
- **`conversations` + `chat_messages`** - persist slot-filling state and the
  parsed intent per message (serverless functions are stateless).
- **`transactions.idempotency_key`** (unique) - stops a retried "pay €150" from
  double-charging.

### Make the mocked payment atomic

Balance deduction + transaction insert must not race. Do it in one Postgres
function and call it via `rpc`:

```sql
create or replace function public.record_mock_payment(
  p_account_id text,
  p_amount_cents int,
  p_idempotency_key text default null
) returns jsonb
language plpgsql as $$
declare
  v_holder uuid;
  v_balance int;
  v_txn public.transactions;
begin
  select id, balance_cents into v_holder, v_balance
  from public.account_holders where account_id = p_account_id for update;

  if v_holder is null then raise exception 'unknown account'; end if;
  if p_amount_cents <= 0 then raise exception 'amount must be positive'; end if;
  if p_amount_cents > v_balance then raise exception 'amount exceeds balance'; end if;

  insert into public.transactions(account_holder_id, type, status, amount_cents,
    currency, description, transaction_date)
  values (v_holder, 'payment', 'completed', p_amount_cents, 'EUR',
    'Mocked card payment', current_date)
  returning * into v_txn;

  update public.account_holders
     set balance_cents = balance_cents - p_amount_cents, updated_at = now()
   where id = v_holder;

  return jsonb_build_object('transaction', to_jsonb(v_txn),
                            'new_balance_cents', v_balance - p_amount_cents);
end $$;
```

### Row Level Security

Even for a single demo account, enabling RLS reads well for a fintech role.
`/api/chat` uses the `service_role` key, which bypasses RLS, so you can enable
RLS on all tables and add read policies for the anon key without breaking writes:

```sql
alter table public.account_holders enable row level security;
-- repeat for the other tables; add SELECT policies for the browser as needed.
```

---

## 5. Quick verification

```powershell
supabase db reset        # apply migrations + seed
pnpm test                # core logic is DB-independent (in-memory repo)
pnpm dev                 # open http://localhost:3000, try the chat
```
