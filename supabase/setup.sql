-- Run this once in Supabase Dashboard → SQL Editor → New query.
-- This is intentionally simple for a friends-only game. Before making the
-- app public, replace the open policies with authenticated/player-specific ones.

create table if not exists public.golf_rooms (
  code text primary key check (code ~ '^(GOLF|PHASE)-[A-Z0-9]{4}$'),
  state jsonb not null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.golf_rooms enable row level security;

create policy "friends can read rooms"
  on public.golf_rooms for select
  to anon
  using (true);

create policy "friends can create rooms"
  on public.golf_rooms for insert
  to anon
  with check (true);

create policy "friends can update rooms"
  on public.golf_rooms for update
  to anon
  using (true)
  with check (true);

alter publication supabase_realtime add table public.golf_rooms;
