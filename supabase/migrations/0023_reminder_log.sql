-- 0023_reminder_log.sql — V18: answer "did the reminder go out, to whom, and
-- what did the provider say?" instead of guessing.
--
-- One row per send ATTEMPT by send-sms-reminders — success and failure alike,
-- with the provider's raw status and its decoded meaning. Clients skipped for
-- having no phone are not logged here (they'd repeat every hourly tick); the
-- roster's reachability chip (app/clients.tsx) makes those visible instead.
-- `channel` allows 'email' so send-reminders can log here too if email
-- reminders are ever scheduled again (see 0022).
--
-- RLS: a trainer reads the rows for their own scheduled workouts; nobody
-- writes except service_role (the edge function), which bypasses RLS.
--
-- Re-runnable.

create table if not exists public.reminder_log (
  id uuid primary key default gen_random_uuid(),
  scheduled_workout_id uuid not null references public.scheduled_workouts (id) on delete cascade,
  channel text not null check (channel in ('sms', 'email')),
  kind text not null check (kind in ('day_before', 'morning_of')),
  recipient text not null,
  provider_status text,
  error text,
  created_at timestamptz not null default now()
);

create index if not exists reminder_log_workout_idx
  on public.reminder_log (scheduled_workout_id, created_at desc);

alter table public.reminder_log enable row level security;
revoke all on public.reminder_log from anon;
revoke insert, update, delete on public.reminder_log from authenticated;

drop policy if exists "reminder_log_trainer_read" on public.reminder_log;
create policy "reminder_log_trainer_read" on public.reminder_log
  for select to authenticated
  using (
    exists (
      select 1 from public.scheduled_workouts sw
      where sw.id = reminder_log.scheduled_workout_id and sw.trainer_id = auth.uid()
    )
  );
