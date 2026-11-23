-- 0045_reopen_and_not_before_its_day.sql — no workout completes before its
-- day, and the trainer can reopen one that was finished by mistake.
--
-- WHY (Idan's phone test, 2026-11-23): on 21.11, before "a workout opens on
-- its day" reached the phones, a client finished four free workouts dated
-- 22.11–29.11 within 13 seconds, with no sets. The calendar showed
-- tomorrow's session as done, and the trainer couldn't undo it: U6's undo
-- only covered sessions with no workout log at all, and an app client's log
-- isn't the trainer's to delete under RLS.
--
-- 1. trg_prevent_early_completion: a scheduled workout can't become
--    'completed' before its scheduled_date (Asia/Jerusalem, as lib/dates.ts
--    and every view use). The app already never offers it; this holds for
--    old app builds and any other path (complete_workout's update included).
--    Existing rows aren't touched: it fires only on a status change.
-- 2. reopen_workout(id): the session's own trainer sets a completed session
--    back to 'scheduled'. If it has a workout log, the log must hold no sets
--    and no skips/swaps ('workout_has_sets' otherwise) — real training is
--    never deleted — and that empty log (its effort and note) is removed, so
--    the client can log the session properly later (0037's one-log-per-
--    workout index would otherwise return the empty one). 0043's trigger
--    gives the package its session back. SECURITY DEFINER because the log
--    can belong to an app client; the trainer check is the first statement.
--
-- Re-runnable.

create or replace function public.prevent_early_completion()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'completed'
     and old.status is distinct from 'completed'
     and new.scheduled_date > (now() at time zone 'Asia/Jerusalem')::date then
    raise exception 'workout_not_yet';
  end if;
  return new;
end;
$$;

revoke execute on function public.prevent_early_completion() from public, anon, authenticated;

drop trigger if exists trg_prevent_early_completion on public.scheduled_workouts;
create trigger trg_prevent_early_completion
  before update of status on public.scheduled_workouts
  for each row execute function public.prevent_early_completion();

create or replace function public.reopen_workout(p_scheduled_workout_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sw public.scheduled_workouts;
  v_log uuid;
begin
  select * into v_sw
  from public.scheduled_workouts
  where id = p_scheduled_workout_id
  for update;
  if not found or v_sw.trainer_id is distinct from auth.uid() then
    raise exception 'workout_not_found';
  end if;
  if v_sw.status <> 'completed' then
    return;
  end if;

  select id into v_log from public.workout_logs where scheduled_workout_id = v_sw.id;
  if v_log is not null then
    if exists (select 1 from public.set_logs where workout_log_id = v_log)
       or exists (select 1 from public.exercise_adjustments where workout_log_id = v_log) then
      raise exception 'workout_has_sets';
    end if;
    delete from public.workout_logs where id = v_log;
  end if;

  update public.scheduled_workouts set status = 'scheduled' where id = v_sw.id;
end;
$$;

revoke all on function public.reopen_workout(uuid) from public, anon;
grant execute on function public.reopen_workout(uuid) to authenticated;
