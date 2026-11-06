-- 0034_client_workout_guard.sql — a client can complete their workout and
-- shift a solo one, nothing else.
--
-- WHY: scheduled_workouts_client_update (0005) lets a client update their own
-- rows, and the guard (0005c, extended in 0010) only covered the date of a
-- trainer-led workout, with_trainer and paid. Straight through the API a
-- client could:
--   * set a completed workout back to 'scheduled' — its debt left "not
--     paid" and the month's earnings, and completing it again took a second
--     session off the package (trg_increment_used_sessions);
--   * move a completed workout to another month;
--   * change trainer_id, the template, the trainer's note or the series.
--
-- HOW: the same guard function, replaced with every rule in one place. What
-- the app itself does still passes: saveWorkout() sets scheduled ->
-- completed (and a repeated save writes completed over completed, which is
-- no change), and Today shifts the date of a solo workout that isn't done.
-- set search_path is restated because create or replace drops what 0024 set.
--
-- Trainers are untouched: every rule applies only when the caller is the
-- row's client.
--
-- Re-runnable.

create or replace function public.prevent_client_reschedule()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.uid() = old.client_id then
    -- A client may not move a trainer-led workout to a different date...
    if old.with_trainer and new.scheduled_date is distinct from old.scheduled_date then
      raise exception 'Trainer-led workouts can only be rescheduled by the trainer.';
    end if;
    -- ...nor flip the trainer-led flag themselves (only the trainer decides that)...
    if new.with_trainer is distinct from old.with_trainer then
      raise exception 'Only the trainer can change whether a workout is trainer-led.';
    end if;
    -- ...nor mark their own session as paid (that's the trainer's confirmation).
    if new.paid is distinct from old.paid then
      raise exception 'Only the trainer can change payment status.';
    end if;
    -- 0034: the only status change a client makes is completing the workout.
    if new.status is distinct from old.status
       and not (old.status = 'scheduled' and new.status = 'completed') then
      raise exception 'A client can only mark a workout completed.';
    end if;
    -- 0034: a completed workout is history — it stays on its day.
    if old.status = 'completed'
       and (new.scheduled_date is distinct from old.scheduled_date
            or new.scheduled_time is distinct from old.scheduled_time) then
      raise exception 'A completed workout can no longer be moved.';
    end if;
    -- 0034: what the workout is, and whose, is the trainer's to set.
    if new.trainer_id is distinct from old.trainer_id
       or new.managed_client_id is distinct from old.managed_client_id
       or new.template_id is distinct from old.template_id
       or new.notes is distinct from old.notes
       or new.series_id is distinct from old.series_id then
      raise exception 'Only the trainer can change this workout''s details.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_client_reschedule on public.scheduled_workouts;
create trigger trg_prevent_client_reschedule
  before update on public.scheduled_workouts
  for each row execute function public.prevent_client_reschedule();
