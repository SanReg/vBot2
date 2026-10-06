create table if not exists users (
  id bigserial primary key,
  discord_id text not null unique,
  discord_username text,
  lightning_address text,
  balance_sats numeric(20,2) not null default 0,
  created_at timestamptz not null default now()
);

alter table users add column if not exists discord_username text;
alter table users add column if not exists lightning_address text;

create table if not exists balance_ledger (
  id bigserial primary key,
  discord_id text not null,
  delta_sats numeric(20,2) not null,
  reason text not null,
  created_at timestamptz not null default now()
);

create index if not exists balance_ledger_discord_id_idx on balance_ledger(discord_id);

create table if not exists lightning_invoices (
  id bigserial primary key,
  discord_id text not null,
  amount_sats bigint not null,
  hash text not null unique,
  invoice_text text,
  received_sats bigint not null default 0,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists lightning_invoices_discord_id_idx on lightning_invoices(discord_id);

-- Open minedrops only: a row is deleted in the same transaction that pays the drop out.
create table if not exists minedrops (
  id uuid primary key,
  host_id text not null,
  amount_sats numeric(20,2) not null,
  tiles integer not null,
  treasure_index integer not null,
  channel_id text not null,
  message_id text,
  tried_users text[] not null default '{}',
  guessed_indices integer[] not null default '{}',
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

-- Balances, ledger entries and minedrops allow two decimal places. Deposit invoices stay whole sats.
-- Converts databases created with the earlier bigint columns; a no-op once applied.
alter table users alter column balance_sats type numeric(20,2);
alter table balance_ledger alter column delta_sats type numeric(20,2);
alter table minedrops alter column amount_sats type numeric(20,2);
