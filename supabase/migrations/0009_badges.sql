-- 0009_badges.sql — V9: streaks + badges.
--
-- A badge is awarded at most once per (client_id, type) — the unique
-- constraint lets lib/badges.ts safely upsert without ever double-awarding.
-- Client-scoped RLS only (the client's own app code awards these on workout
-- completion; no trainer policy is asked for by this step).
--
-- Re-runnable.

create table if not exists public.badges (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles (id) on delete cascade,
  type text not null check (type in ('first_workout', 'streak_10', 'first_month')),
  earned_at timestamptz not null default now(),
  unique (client_id, type)
);

create index if not exists badges_client_idx on public.badges (client_id);

alter table public.badges enable row level security;

drop policy if exists "badges_client_all" on public.badges;
create policy "badges_client_all" on public.badges
  for all to authenticated
  using (auth.uid() = client_id)
  with check (auth.uid() = client_id);
