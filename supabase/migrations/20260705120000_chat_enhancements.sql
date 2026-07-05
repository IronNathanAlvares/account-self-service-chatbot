-- Enhancements for the account self-service chatbot:
--  * idempotency guard on payments
--  * audit trail of every persisted change (powers the audit view + undo)
--  * atomic mocked-payment function (deduct balance + insert txn in one txn)

-- 1. Idempotency: a retried "pay 150" must not double-charge.
alter table public.transactions
  add column if not exists idempotency_key text;

create unique index if not exists transactions_idempotency_key_uidx
  on public.transactions (idempotency_key)
  where idempotency_key is not null;

-- 2. Audit trail: before/after snapshot of each change.
create table if not exists public.account_change_events (
  id uuid primary key default gen_random_uuid(),
  account_holder_id uuid not null references public.account_holders(id) on delete cascade,
  action text not null,
  changed_by text not null default 'account_holder',
  summary text not null,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);

create index if not exists account_change_events_holder_idx
  on public.account_change_events (account_holder_id, created_at desc);

-- 3. Atomic mocked payment. Locks the row, validates, deducts, inserts.
create or replace function public.record_mock_payment(
  p_account_id text,
  p_amount_cents integer,
  p_idempotency_key text default null
) returns jsonb
language plpgsql
as $$
declare
  v_holder uuid;
  v_balance integer;
  v_txn public.transactions;
begin
  -- Idempotency: return the existing transaction if this key was already used.
  if p_idempotency_key is not null then
    select * into v_txn from public.transactions
      where idempotency_key = p_idempotency_key limit 1;
    if found then
      select balance_cents into v_balance from public.account_holders
        where id = v_txn.account_holder_id;
      return jsonb_build_object('transaction', to_jsonb(v_txn),
                                'new_balance_cents', v_balance, 'replayed', true);
    end if;
  end if;

  select id, balance_cents into v_holder, v_balance
    from public.account_holders where account_id = p_account_id for update;

  if v_holder is null then raise exception 'unknown account %', p_account_id; end if;
  if p_amount_cents <= 0 then raise exception 'amount must be positive'; end if;
  if p_amount_cents > v_balance then raise exception 'amount exceeds balance'; end if;

  insert into public.transactions(account_holder_id, type, status, amount_cents,
      currency, description, transaction_date, idempotency_key)
    values (v_holder, 'payment', 'completed', p_amount_cents,
      (select currency from public.account_holders where id = v_holder),
      'Mocked card payment', current_date, p_idempotency_key)
    returning * into v_txn;

  update public.account_holders
     set balance_cents = balance_cents - p_amount_cents, updated_at = now()
   where id = v_holder;

  return jsonb_build_object('transaction', to_jsonb(v_txn),
                            'new_balance_cents', v_balance - p_amount_cents,
                            'replayed', false);
end $$;
