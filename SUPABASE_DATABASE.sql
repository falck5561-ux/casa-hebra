-- Run this once in Supabase > SQL Editor for the Casa Hebra project.
create table if not exists public.casa_hebra_store (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.casa_hebra_store enable row level security;

-- Intentionally no public RLS policies.
-- Casa Hebra accesses this table only from the server with the secret/service key.
revoke all on table public.casa_hebra_store from anon, authenticated;
