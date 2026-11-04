-- 0033_exercise_delete_guard.sql — an exercise someone has trained can't be
-- deleted from the app.
--
-- WHY: set_logs.exercise_id and exercise_adjustments.exercise_id cascade from
-- exercises (0005, 0005b), so deleting an exercise from the library silently
-- erased every client's logged sets of it — their history and their PRs —
-- and every skip or swap recorded against it. The app only warned "this
-- can't be undone".
--
-- HOW: a BEFORE DELETE guard trigger (house pattern, see 0013) that refuses
-- the delete while any set or adjustment points at the exercise. The FKs stay
-- as they are, so deleting an account still cascades cleanly. An exercise
-- nobody has trained still deletes (and leaves the templates it was in, as
-- before). The app maps the 'exercise_in_use' message to its own text
-- (app/(tabs)/exercises/[id].tsx).
--
-- SECURITY DEFINER so the check sees every client's rows: under RLS a trainer
-- reads only the logs of workouts they scheduled, which would miss a set that
-- sits in another trainer's workout.
--
-- The guard applies only to end-user connections (auth.uid() is not null):
-- the SQL Editor (postgres) and service_role (delete-account) stay free.
--
-- Re-runnable.

create or replace function public.prevent_used_exercise_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and (
    exists (select 1 from public.set_logs where exercise_id = old.id)
    or exists (
      select 1 from public.exercise_adjustments
      where exercise_id = old.id or swapped_for_exercise_id = old.id
    )
  ) then
    raise exception 'exercise_in_use';
  end if;
  return old;
end;
$$;

-- A trigger function, never an RPC (same as 0024 for increment_used_sessions).
revoke execute on function public.prevent_used_exercise_delete() from public, anon, authenticated;

drop trigger if exists trg_prevent_used_exercise_delete on public.exercises;
create trigger trg_prevent_used_exercise_delete
  before delete on public.exercises
  for each row execute function public.prevent_used_exercise_delete();
