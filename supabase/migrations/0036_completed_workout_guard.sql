-- 0036_completed_workout_guard.sql — a completed workout is history: it
-- keeps its day, its client and its workout, and it can't be deleted.
--
-- WHY: the edit screen opened completed workouts like any other. Deleting
-- one cascaded away the client's workout log (sets, PRs, effort) and took
-- its revenue out of trainer_monthly_money, while packages.used_sessions
-- kept the session as used. Moving its date moved revenue to another month;
-- changing its client moved revenue and package history to someone else.
--
-- HOW: a BEFORE UPDATE OR DELETE guard on scheduled_workouts (house
-- pattern, see 0013 / 0034). While a row is completed:
--   * it can't be deleted;
--   * scheduled_date, client_id and managed_client_id can't change;
--   * template_id can't change to another template. Clearing it stays
--     allowed: deleting a template sets it to null (0004, on delete set
--     null), and the logged sets keep the history anyway.
-- Everything else stays open: paid, notes, the time, with_trainer, and the
-- status itself — a trainer can still set a row back to scheduled (group
-- attendance, an undo), after which the row is editable again.
--
-- The guard applies only to end-user connections (auth.uid() is not null):
-- the SQL Editor (postgres) and service_role (delete-account's cascades)
-- stay free. The app shows completed workouts read-only
-- (app/(tabs)/schedule/[id].tsx) and maps 'completed_workout_locked'.
--
-- Re-runnable.

create or replace function public.prevent_completed_workout_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.uid() is null or old.status <> 'completed' then
    return coalesce(new, old);
  end if;
  if tg_op = 'DELETE' then
    raise exception 'completed_workout_locked';
  end if;
  if new.scheduled_date is distinct from old.scheduled_date
     or new.client_id is distinct from old.client_id
     or new.managed_client_id is distinct from old.managed_client_id
     or (new.template_id is distinct from old.template_id and new.template_id is not null) then
    raise exception 'completed_workout_locked';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_completed_workout_change on public.scheduled_workouts;
create trigger trg_prevent_completed_workout_change
  before update or delete on public.scheduled_workouts
  for each row execute function public.prevent_completed_workout_change();
