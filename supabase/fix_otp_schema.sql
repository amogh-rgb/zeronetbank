-- ZeroNetPay Supabase Fix Schema (missing tables)

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

create table if not exists public.phone_otp_codes (
  id uuid primary key default gen_random_uuid(),
  phone text not null,
  otp_hash text not null,
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

create index if not exists idx_users_wallet_id on public.users(wallet_id);
create index if not exists idx_users_email on public.users(email);
create index if not exists idx_otp_codes_email_purpose on public.otp_codes(email, purpose);
create index if not exists idx_otp_codes_expires_at on public.otp_codes(expires_at);
create index if not exists idx_phone_otp_codes_phone on public.phone_otp_codes(phone);

insert into public.bank_state (id, vault_balance)
values (1, 1000000.00)
on conflict (id) do nothing;
