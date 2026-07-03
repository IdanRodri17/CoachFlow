-- 0006_effort_pr.sql — V6: effort rating, client note, and auto-PR.
--
-- The columns this version uses already exist (added nullable in 0005_logging.sql):
--   workout_logs.effort_rating (1..10 check), workout_logs.client_note,
--   set_logs.is_pr (default false).
-- The `if not exists` guards below make this migration self-contained for a fresh
-- apply and a harmless no-op otherwise. PR detection itself is done in app code
-- (lib/pr.ts) and written into set_logs.is_pr on completion.
--
-- Re-runnable.

alter table public.workout_logs add column if not exists effort_rating integer;
alter table public.workout_logs add column if not exists client_note text;
alter table public.set_logs add column if not exists is_pr boolean not null default false;

-- Ensure the 1..10 bound exists (safe if it's already there).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'workout_logs_effort_rating_check'
  ) then
    alter table public.workout_logs
      add constraint workout_logs_effort_rating_check
      check (effort_rating is null or effort_rating between 1 and 10);
  end if;
end $$;
