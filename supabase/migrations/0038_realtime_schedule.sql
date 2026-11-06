-- 0038_realtime_schedule.sql — the calendar updates live (V19, handoff #3).
--
-- Adds scheduled_workouts to the supabase_realtime publication, which had no
-- tables (checked 2026-11-06). The app subscribes once per signed-in user
-- (lib/useScheduleRealtime.ts): a trainer to their own rows, a client to
-- theirs, and refetches the schedule queries when one changes — a workout a
-- client completes shows on the trainer's open calendar at once, without a
-- pull-to-refresh or a trip through the background.
--
-- Realtime checks every change against the subscriber's RLS SELECT policies,
-- so nobody receives a row they couldn't already read. Deletes aren't
-- delivered to a filtered subscription (the old row carries only its id
-- under RLS); the app refetches on focus for those, as before.
--
-- Re-runnable: adding a table that is already published is skipped.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'scheduled_workouts'
  ) then
    alter publication supabase_realtime add table public.scheduled_workouts;
  end if;
end;
$$;
