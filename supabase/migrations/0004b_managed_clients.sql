-- 0004b_managed_clients.sql — "offline" clients.
--
-- Some of a trainer's clients won't use the app. A `managed_client` is just a
-- name the trainer owns, so they can still appear in the roster and be scheduled
-- / tracked. They have no auth account and see nothing in the app.
--
-- A scheduled_workout now belongs to EITHER an app client (client_id) OR a
-- managed client (managed_client_id) — exactly one of the two.
--
-- Re-runnable.

create table if not exists public.managed_clients (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists managed_clients_trainer_id_idx on public.managed_clients (trainer_id);

alter table public.managed_clients enable row level security;

-- Trainer owns their managed clients (clients have no access — no auth account).
drop policy if exists "managed_clients_owner_all" on public.managed_clients;
create policy "managed_clients_owner_all" on public.managed_clients
  for all to authenticated
  using (auth.uid() = trainer_id)
  with check (auth.uid() = trainer_id);

-- Extend scheduled_workouts to allow a managed client instead of an app client.
alter table public.scheduled_workouts
  add column if not exists managed_client_id uuid references public.managed_clients (id) on delete cascade;

-- client_id is no longer required (managed rows leave it null).
alter table public.scheduled_workouts alter column client_id drop not null;

-- Exactly one of client_id / managed_client_id must be set (XOR).
alter table public.scheduled_workouts drop constraint if exists scheduled_workouts_one_client;
alter table public.scheduled_workouts
  add constraint scheduled_workouts_one_client
  check ((client_id is not null) <> (managed_client_id is not null));

create index if not exists scheduled_workouts_managed_client_idx
  on public.scheduled_workouts (managed_client_id);

-- Existing RLS already covers managed rows: the trainer policy matches on
-- trainer_id; the client read policy matches client_id (null for managed rows),
-- so clients never see managed-client workouts. No new policy needed.
