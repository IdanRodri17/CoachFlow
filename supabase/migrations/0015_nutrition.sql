-- 0015_nutrition.sql — V15: AI nutrition assistant.
--
-- nutrition_plans: one row per generated-and-saved plan (history is kept —
-- "the latest saved plan" is derived on read via order by created_at desc,
-- never a separate "current" flag to keep in sync). targets is the numeric
-- inputs the trainer entered (calories/protein_g/carbs_g/fat_g/preferences)
-- as jsonb so we don't need a migration every time the shape grows;
-- plan_markdown is Claude's generated text, saved by the app after the
-- trainer reviews it (the edge function that talks to Claude never writes to
-- the DB — see supabase/functions/nutrition-suggest).
--
-- Same XOR-client pattern as scheduled_workouts/packages: exactly one of
-- client_id (app client) or managed_client_id (offline client) is set.
-- Offline clients have no auth account and can't read anything, so the
-- client-read policy below only ever matches app clients.
--
-- Re-runnable.

create table if not exists public.nutrition_plans (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references public.profiles (id) on delete cascade,
  client_id uuid references public.profiles (id) on delete cascade,
  managed_client_id uuid references public.managed_clients (id) on delete cascade,
  targets jsonb not null,
  plan_markdown text not null,
  created_at timestamptz not null default now(),
  constraint nutrition_plans_one_client check ((client_id is not null) <> (managed_client_id is not null))
);

create index if not exists nutrition_plans_trainer_client_idx
  on public.nutrition_plans (trainer_id, client_id, created_at desc);
create index if not exists nutrition_plans_trainer_managed_idx
  on public.nutrition_plans (trainer_id, managed_client_id, created_at desc);

alter table public.nutrition_plans enable row level security;

-- Trainer manages plans they created (both client kinds).
drop policy if exists "nutrition_plans_trainer_all" on public.nutrition_plans;
create policy "nutrition_plans_trainer_all" on public.nutrition_plans
  for all to authenticated
  using (auth.uid() = trainer_id)
  with check (auth.uid() = trainer_id);

-- An app client can read their own saved plans (their latest = most recent row).
drop policy if exists "nutrition_plans_client_read" on public.nutrition_plans;
create policy "nutrition_plans_client_read" on public.nutrition_plans
  for select to authenticated
  using (auth.uid() = client_id);
