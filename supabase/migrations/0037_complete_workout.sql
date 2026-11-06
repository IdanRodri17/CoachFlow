-- 0037_complete_workout.sql — saving a workout is one transaction, and a
-- second save of the same workout returns the first one (F3).
--
-- WHY: saveWorkout() (lib/useWorkoutSession.ts) made four separate writes:
-- the workout log, its sets, its swaps/skips, then the scheduled workout's
-- status. A dropped connection between them left a log without its sets or
-- without the status, and the retry on the finish screen inserted a second
-- log — duplicates in "last workout", in PR history and in the counts.
--
-- HOW: complete_workout() does all four writes in one transaction. It locks
-- the scheduled workout first, so two saves of the same workout run one
-- after the other, and when a log already exists it returns that log's id
-- and writes nothing (completing the status if a partial save left it
-- open). The client still computes the PR flags (lib/pr.ts) and sends them.
--
-- SECURITY INVOKER: every row goes through the caller's own RLS, exactly as
-- the four direct writes did — an app client logs their own workout
-- (workout_logs_client_all), a trainer logs an offline client's
-- (0032 *_trainer_managed_all; logged_by defaults to auth.uid()). The
-- subject comes from the locked scheduled workout, never from the caller.
--
-- Not added here: a unique index on workout_logs(scheduled_workout_id).
-- Duplicates may already exist in the live data and would make it fail.
-- Check first, then add it in its own migration:
--   select scheduled_workout_id, count(*) from public.workout_logs
--   group by 1 having count(*) > 1;
--
-- Re-runnable.

create or replace function public.complete_workout(
  p_scheduled_workout_id uuid,
  p_duration_seconds integer,
  p_effort_rating integer,
  p_client_note text,
  p_sets jsonb,
  p_adjustments jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_sw public.scheduled_workouts;
  v_log_id uuid;
begin
  -- The lock also proves the caller may write this workout (RLS on update).
  select * into v_sw
  from public.scheduled_workouts
  where id = p_scheduled_workout_id
  for update;
  if not found then
    raise exception 'workout_not_found';
  end if;

  -- A retry after a save that already landed: hand back that log.
  select id into v_log_id
  from public.workout_logs
  where scheduled_workout_id = p_scheduled_workout_id
  order by completed_at
  limit 1;

  if v_log_id is null then
    insert into public.workout_logs (
      scheduled_workout_id, client_id, managed_client_id,
      duration_seconds, effort_rating, client_note
    )
    values (
      p_scheduled_workout_id, v_sw.client_id, v_sw.managed_client_id,
      p_duration_seconds, p_effort_rating, p_client_note
    )
    returning id into v_log_id;

    insert into public.set_logs (workout_log_id, exercise_id, set_index, reps, weight, is_pr)
    select
      v_log_id,
      (s ->> 'exercise_id')::uuid,
      (s ->> 'set_index')::integer,
      (s ->> 'reps')::integer,
      (s ->> 'weight')::numeric,
      coalesce((s ->> 'is_pr')::boolean, false)
    from jsonb_array_elements(coalesce(p_sets, '[]'::jsonb)) as s;

    insert into public.exercise_adjustments (workout_log_id, exercise_id, action, swapped_for_exercise_id, reason)
    select
      v_log_id,
      (a ->> 'exercise_id')::uuid,
      a ->> 'action',
      (a ->> 'swapped_for_exercise_id')::uuid,
      a ->> 'reason'
    from jsonb_array_elements(coalesce(p_adjustments, '[]'::jsonb)) as a;
  end if;

  update public.scheduled_workouts
  set status = 'completed'
  where id = p_scheduled_workout_id and status <> 'completed';

  return v_log_id;
end;
$$;

revoke all on function public.complete_workout(uuid, integer, integer, text, jsonb, jsonb) from public, anon;
grant execute on function public.complete_workout(uuid, integer, integer, text, jsonb, jsonb) to authenticated;
