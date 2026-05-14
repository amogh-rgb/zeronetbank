-- ZeroNetPay Supabase production schema
-- Apply this in the Supabase SQL editor or with a Postgres client.

create extension if not exists "pgcrypto";

create table if not exists public.wallets (
  wallet_id text primary key,
  phone text not null unique,
  email text unique,
  public_key text not null unique,
  display_name text not null,
  balance numeric(15,2) not null default 0.00 check (balance >= 0),
  trust_score integer not null default 100 check (trust_score >= 0 and trust_score <= 100),
  status text not null default 'ONLINE',
  is_frozen boolean not null default false,
  last_seen_at timestamptz,
  last_sync_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  wallet_id text not null unique references public.wallets(wallet_id) on delete cascade,
  email text not null unique,
  phone text not null unique,
  display_name text not null,
  pin_hash text not null,
  email_verified boolean not null default false,
  status text not null default 'ONLINE',
  last_login_at timestamptz,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.transactions (
  tx_id text primary key,
  sender_id text references public.wallets(wallet_id) on delete set null,
  receiver_id text references public.wallets(wallet_id) on delete set null,
  amount numeric(15,2) not null check (amount > 0),
  status text not null default 'PENDING' check (status in ('PENDING', 'CONFIRMED', 'FAILED')),
  type text not null default 'ONLINE' check (type in ('ONLINE', 'OFFLINE_BLE', 'TRANSFER', 'ADMIN_DEPOSIT', 'ADMIN_WITHDRAW')),
  signature text,
  nonce text unique,
  idempotency_key text unique,
  description text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  settled_at timestamptz
);

create table if not exists public.otp_codes (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  purpose text not null check (purpose in ('login', 'register', 'transaction', 'reset')),
  otp_hash text not null,
  verification_token text unique,
  expires_at timestamptz not null,
  verified_at timestamptz,
  consumed_at timestamptz,
  attempts integer not null default 0 check (attempts >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.bank_state (
  id integer primary key check (id = 1),
  vault_balance numeric(15,2) not null default 1000000.00 check (vault_balance >= 0),
  updated_at timestamptz not null default now()
);

create index if not exists idx_wallets_status on public.wallets(status);
create index if not exists idx_wallets_last_seen_at on public.wallets(last_seen_at desc);
create index if not exists idx_transactions_sender_id on public.transactions(sender_id);
create index if not exists idx_transactions_receiver_id on public.transactions(receiver_id);
create index if not exists idx_transactions_created_at on public.transactions(created_at desc);
create index if not exists idx_transactions_status on public.transactions(status);
create index if not exists idx_users_wallet_id on public.users(wallet_id);
create index if not exists idx_users_email on public.users(email);
create index if not exists idx_otp_codes_email_purpose on public.otp_codes(email, purpose);
create index if not exists idx_otp_codes_expires_at on public.otp_codes(expires_at);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_wallets_updated_at on public.wallets;
create trigger trg_wallets_updated_at
before update on public.wallets
for each row execute function public.set_updated_at();

drop trigger if exists trg_users_updated_at on public.users;
create trigger trg_users_updated_at
before update on public.users
for each row execute function public.set_updated_at();

alter table public.wallets enable row level security;
alter table public.users enable row level security;
alter table public.transactions enable row level security;
alter table public.otp_codes enable row level security;
alter table public.bank_state enable row level security;

drop policy if exists "deny direct wallets access" on public.wallets;
create policy "deny direct wallets access" on public.wallets
for all using (false) with check (false);

drop policy if exists "deny direct users access" on public.users;
create policy "deny direct users access" on public.users
for all using (false) with check (false);

drop policy if exists "deny direct transactions access" on public.transactions;
create policy "deny direct transactions access" on public.transactions
for all using (false) with check (false);

drop policy if exists "deny direct otp access" on public.otp_codes;
create policy "deny direct otp access" on public.otp_codes
for all using (false) with check (false);

drop policy if exists "deny direct bank state access" on public.bank_state;
create policy "deny direct bank state access" on public.bank_state
for all using (false) with check (false);

alter table public.wallets replica identity full;
alter table public.transactions replica identity full;

create or replace function public.process_transfer(
  p_sender_id text,
  p_receiver_id text,
  p_amount numeric,
  p_tx_id text,
  p_signature text,
  p_nonce text default null,
  p_type text default 'ONLINE'
) returns jsonb
language plpgsql
as $$
declare
  sender_balance numeric;
  updated_balance numeric;
begin
  if exists(select 1 from public.transactions where tx_id = p_tx_id) then
    select balance into updated_balance from public.wallets where wallet_id = p_sender_id;
    return jsonb_build_object('success', true, 'tx_id', p_tx_id, 'new_balance', coalesce(updated_balance, 0), 'idempotent', true);
  end if;

  select balance into sender_balance
  from public.wallets
  where wallet_id = p_sender_id
  for update;

  if sender_balance is null then
    return jsonb_build_object('success', false, 'error', 'Sender wallet not found');
  end if;

  if sender_balance < p_amount then
    return jsonb_build_object('success', false, 'error', 'Insufficient balance');
  end if;

  perform 1 from public.wallets where wallet_id = p_receiver_id;
  if not found then
    return jsonb_build_object('success', false, 'error', 'Receiver wallet not found');
  end if;

  update public.wallets
  set balance = balance - p_amount,
      last_sync_at = now(),
      updated_at = now()
  where wallet_id = p_sender_id;

  update public.wallets
  set balance = balance + p_amount,
      last_sync_at = now(),
      updated_at = now()
  where wallet_id = p_receiver_id;

  insert into public.transactions (
    tx_id, sender_id, receiver_id, amount, status, type, signature, nonce,
    idempotency_key, settled_at, created_at
  ) values (
    p_tx_id, p_sender_id, p_receiver_id, p_amount, 'CONFIRMED', p_type, p_signature,
    p_nonce, coalesce(p_nonce, p_tx_id), now(), now()
  );

  select balance into updated_balance from public.wallets where wallet_id = p_sender_id;

  return jsonb_build_object('success', true, 'tx_id', p_tx_id, 'new_balance', updated_balance);
end;
$$;

insert into public.bank_state (id, vault_balance)
values (1, 1000000.00)
on conflict (id) do nothing;
