-- 0008b_client_notes.sql — V8b: private trainer-only notes on a client.
--
-- A running, timestamped log the trainer keeps on a client (e.g. "needs core
-- work", "tends to skip legs"). Strictly trainer-only per SRS §4: there is NO
-- client-read policy at all, so the client can never see these — not in the
-- app, not via a direct API call.
--
-- Scoped to app clients only (client_id -> profiles), matching the SRS §4
-- schema. Offline/managed clients already have the simpler single-field
-- managed_clients.note for the same purpose at a smaller scope.
--
-- Re-runnable.

create table if not exists public.client_notes (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references public.profiles (id) on delete cascade,
  client_id uuid not null references public.profiles (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists client_notes_trainer_client_idx
  on public.client_notes (trainer_id, client_id, created_at desc);

alter table public.client_notes enable row level security;

-- Trainer-only. Deliberately no client-read (or any other) policy: RLS
-- defaults to deny, so the client can never read these rows.
drop policy if exists "client_notes_trainer_all" on public.client_notes;
create policy "client_notes_trainer_all" on public.client_notes
  for all to authenticated
  using (auth.uid() = trainer_id)
  with check (auth.uid() = trainer_id);
