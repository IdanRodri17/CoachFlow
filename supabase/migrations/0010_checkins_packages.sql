-- 0010_checkins_packages.sql — V10: weekly check-ins + session packages.
--
-- check_ins: a client's self-reported weekly pulse (sleep/energy/soreness/
-- adherence, 1-5, + optional note). App-client only — it's self-reported, and
-- offline/managed clients have no app access to submit one. Once per week,
-- enforced by unique(client_id, week_start); week_start is the Sunday of that
-- week (Asia/Jerusalem), matching this app's existing Sunday-start convention
-- (see lib/dates.ts weekdayOf / the new weekStartOf).
--
-- packages: total_sessions set by the trainer, used_sessions auto-incremented
-- by a trigger whenever ANY scheduled_workout — app client or offline/managed
-- client — flips to 'completed'. A trigger (rather than app code) means both
-- the client's own completion flow and the trainer's "mark complete" for
-- offline clients (V8) increment it identically, with nothing to duplicate
-- or forget to wire up. "Sessions remaining" = total_sessions - used_sessions
-- (SRS §4.1) — computed on read, never stored.
--
-- Re-runnable.

create table if not exists public.check_ins (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles (id) on delete cascade,
  week_start date not null,
  sleep integer not null check (sleep between 1 and 5),
  energy integer not null check (energy between 1 and 5),
  soreness integer not null check (soreness between 1 and 5),
  adherence integer not null check (adherence between 1 and 5),
  note text,
  created_at timestamptz not null default now(),
  unique (client_id, week_start)
);

create index if not exists check_ins_client_idx on public.check_ins (client_id, week_start desc);

alter table public.check_ins enable row level security;

drop policy if exists "check_ins_client_all" on public.check_ins;
create policy "check_ins_client_all" on public.check_ins
  for all to authenticated
  using (auth.uid() = client_id)
  with check (auth.uid() = client_id);

-- Trainer reads check-ins for clients on their roster.
drop policy if exists "check_ins_trainer_read" on public.check_ins;
create policy "check_ins_trainer_read" on public.check_ins
  for select to authenticated
  using (
    exists (
      select 1 from public.trainer_clients tc
      where tc.trainer_id = auth.uid() and tc.client_id = check_ins.client_id
    )
  );

-- ---------------------------------------------------------------------------
-- Packages: one per (trainer, client) — supports both app clients and
-- offline/managed clients (exactly one of client_id / managed_client_id set,
-- same XOR pattern as scheduled_workouts — see 0004b_managed_clients.sql).
-- ---------------------------------------------------------------------------
create table if not exists public.packages (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references public.profiles (id) on delete cascade,
  client_id uuid references public.profiles (id) on delete cascade,
  managed_client_id uuid references public.managed_clients (id) on delete cascade,
  total_sessions integer not null default 0,
  used_sessions integer not null default 0,
  created_at timestamptz not null default now(),
  constraint packages_one_client check ((client_id is not null) <> (managed_client_id is not null))
);

create unique index if not exists packages_trainer_client_uidx
  on public.packages (trainer_id, client_id) where client_id is not null;
create unique index if not exists packages_trainer_managed_uidx
  on public.packages (trainer_id, managed_client_id) where managed_client_id is not null;

alter table public.packages enable row level security;

-- Trainer manages packages they created (both client kinds).
drop policy if exists "packages_trainer_all" on public.packages;
create policy "packages_trainer_all" on public.packages
  for all to authenticated
  using (auth.uid() = trainer_id)
  with check (auth.uid() = trainer_id);

-- An app client can read their own package ("sessions remaining" on their side).
drop policy if exists "packages_client_read" on public.packages;
create policy "packages_client_read" on public.packages
  for select to authenticated
  using (auth.uid() = client_id);

-- ---------------------------------------------------------------------------
-- Auto-increment used_sessions on completion. SECURITY DEFINER because a
-- completing APP CLIENT only has RLS rights to read their own package (not
-- update it) — without bypassing RLS here, the increment would silently
-- affect zero rows whenever a client (rather than the trainer) completes the
-- workout. Scoped tightly: it only ever updates the package matching the
-- exact trainer_id + client reference already on the row being completed,
-- values RLS already validated when that row was written.
-- ---------------------------------------------------------------------------
create or replace function public.increment_used_sessions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'completed' and old.status is distinct from 'completed' then
    if new.client_id is not null then
      update public.packages
      set used_sessions = used_sessions + 1
      where trainer_id = new.trainer_id and client_id = new.client_id;
    elsif new.managed_client_id is not null then
      update public.packages
      set used_sessions = used_sessions + 1
      where trainer_id = new.trainer_id and managed_client_id = new.managed_client_id;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_increment_used_sessions on public.scheduled_workouts;
create trigger trg_increment_used_sessions
  after update on public.scheduled_workouts
  for each row execute function public.increment_used_sessions();

-- ---------------------------------------------------------------------------
-- Payment reminder: a per-workout "did I collect payment for this session"
-- flag the trainer can toggle. NOT a payment system — no money moves through
-- the app (SRS §8 explicitly keeps real payments out, partly to avoid Apple's
-- cut); this is just a manual bookkeeping aid alongside the session package.
-- Nullable-safe default false, existing rows unaffected.
-- ---------------------------------------------------------------------------
alter table public.scheduled_workouts add column if not exists paid boolean not null default false;

-- Only the trainer may mark a session paid — extend the existing
-- client-field-guard trigger (0005c_with_trainer.sql) rather than adding a
-- second one, so there's one place that answers "what can a client change?".
create or replace function public.prevent_client_reschedule()
returns trigger
language plpgsql
as $$
begin
  -- A client may not move a trainer-led workout to a different date...
  if old.with_trainer
     and new.scheduled_date is distinct from old.scheduled_date
     and auth.uid() = old.client_id then
    raise exception 'Trainer-led workouts can only be rescheduled by the trainer.';
  end if;
  -- ...nor flip the trainer-led flag themselves (only the trainer decides that).
  if auth.uid() = old.client_id
     and new.with_trainer is distinct from old.with_trainer then
    raise exception 'Only the trainer can change whether a workout is trainer-led.';
  end if;
  -- ...nor mark their own session as paid (that's the trainer's confirmation).
  if auth.uid() = old.client_id
     and new.paid is distinct from old.paid then
    raise exception 'Only the trainer can change payment status.';
  end if;
  return new;
end;
$$;
