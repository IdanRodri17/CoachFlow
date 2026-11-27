-- 0046_edit_workout_log.sql — fixing a finished workout (Idan, 2026-11-27:
-- "edit it in place").
--
-- WHY: a saved workout couldn't be changed. A forgotten set or a typo in the
-- reps or the weight stayed in the history, in the PRs and in "last time"
-- for good. 0045's reopen_workout only takes back a workout with nothing
-- logged.
--
-- HOW: edit_workout_log() replaces one workout log's sets, effort and note in
-- one transaction.
--   * The log is locked first (FOR UPDATE). SECURITY INVOKER, so every row
--     goes through the caller's own RLS, exactly like complete_workout
--     (0037): an app client edits their own logs (workout_logs_client_all),
--     a trainer an offline client's (0032 *_trainer_managed_all). A trainer
--     can only READ an app client's log, and a FOR UPDATE lock also needs an
--     UPDATE policy, so for them the lock finds nothing: workout_not_found.
--   * Its sets are replaced by the edited list. An exercise that has sets now
--     is no longer "skipped" (that skip is removed); swaps stay.
--   * PR flags have one rule, in the app (lib/pr.ts). The app recomputes the
--     subject's history of the exercises involved and sends the edited log's
--     flags with its sets, plus every OTHER set whose flag the edit changed
--     (a typo of 600 kg hid every later PR) in p_pr_updates. Those updates go
--     through RLS too: only the caller's own rows can change.
--   * completed_at, the duration and the scheduled workout stay as they were,
--     so the package, the money and the streak don't move.
--
-- Next free number after this: 0048 (0047 = own workouts).
--
-- Re-runnable.

create or replace function public.edit_workout_log(
  p_log_id uuid,
  p_effort_rating integer,
  p_client_note text,
  p_sets jsonb,
  p_pr_updates jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
begin
  perform 1 from public.workout_logs where id = p_log_id for update;
  if not found then
    raise exception 'workout_not_found';
  end if;

  delete from public.set_logs where workout_log_id = p_log_id;

  insert into public.set_logs (workout_log_id, exercise_id, set_index, reps, weight, is_pr)
  select
    p_log_id,
    (s ->> 'exercise_id')::uuid,
    (s ->> 'set_index')::integer,
    (s ->> 'reps')::integer,
    (s ->> 'weight')::numeric,
    coalesce((s ->> 'is_pr')::boolean, false)
  from jsonb_array_elements(coalesce(p_sets, '[]'::jsonb)) as s;

  delete from public.exercise_adjustments a
  where a.workout_log_id = p_log_id
    and a.action = 'skipped'
    and exists (
      select 1 from public.set_logs s
      where s.workout_log_id = p_log_id and s.exercise_id = a.exercise_id
    );

  update public.workout_logs
  set effort_rating = p_effort_rating,
      client_note = p_client_note
  where id = p_log_id;

  update public.set_logs sl
  set is_pr = (u ->> 'is_pr')::boolean
  from jsonb_array_elements(coalesce(p_pr_updates, '[]'::jsonb)) as u
  where sl.id = (u ->> 'id')::uuid
    and sl.workout_log_id <> p_log_id
    and sl.is_pr is distinct from (u ->> 'is_pr')::boolean;

  return p_log_id;
end;
$$;

revoke all on function public.edit_workout_log(uuid, integer, text, jsonb, jsonb) from public, anon;
grant execute on function public.edit_workout_log(uuid, integer, text, jsonb, jsonb) to authenticated;
