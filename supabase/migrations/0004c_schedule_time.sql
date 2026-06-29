-- 0004c_schedule_time.sql — optional time-of-day on a scheduled workout.
--
-- A trainer running many sessions a day needs to order their day, so we add an
-- optional `scheduled_time`. It's nullable ("any time"). The DATE stays separate
-- and is still what the "today"/"missed" logic uses (SRS §4.1), so adding a time
-- doesn't change any of that.
--
-- Re-runnable.

alter table public.scheduled_workouts
  add column if not exists scheduled_time time;
