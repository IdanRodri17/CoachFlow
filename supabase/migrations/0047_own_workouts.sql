-- 0047_own_workouts.sql — a client's own workouts (Idan, 2026-11-27).
--
-- WHY: clients also train on their own (an extra gym session), and the
-- trainer wants to see it. Until now every workout was a session the
-- trainer scheduled.
--
-- HOW (Idan's answers): the client starts one from Home, picks exercises as
-- they go, and it's saved when they finish. It's extra, so it's a workout log
-- with no scheduled workout behind it (scheduled_workout_id null), not a
-- scheduled_workouts row. The package (trg_increment_used_sessions), the
-- money view, the SMS reminders, "missed", the streak, the calendars and the
-- attention feed all read scheduled_workouts, so none of them sees it: it
-- never uses a session, never counts as income, never shows as missed and
-- never moves the streak (Idan: "they're extra"). What reads the client's
-- sets (PRs, "last time", progress, client_volume) counts it like any
-- workout.
--   * workout_logs.scheduled_workout_id becomes nullable; a log without one
--     must be an app client's (checked). 0037's unique index still allows one
--     log per scheduled workout; nulls don't collide.
--   * log_own_workout() is the save: one transaction, SECURITY INVOKER (the
--     caller's own RLS, workout_logs_client_all and friends), clients only.
--     The app makes the log id when the workout starts, so a retry after a
--     dropped connection finds the first save and writes nothing (like 0037).
--   * The trainer sees them on the client's card (Idan: "client card only"):
--     read-only policies on the log, its sets and its skips/swaps for a
--     trainer linked to the client in trainer_clients, the same link that
--     lets them read the client's weigh-ins (0007). No trainer writes.
--
-- Next free number after this: 0048.
--
-- Re-runnable.

alter table public.workout_logs alter column scheduled_workout_id drop not null;

alter table public.workout_logs drop constraint if exists workout_logs_own_is_app_client;
alter table public.workout_logs add constraint workout_logs_own_is_app_client
  check (scheduled_workout_id is not null or client_id is not null);

create index if not exists workout_logs_own_idx
  on public.workout_logs (client_id, completed_at desc)
  where scheduled_workout_id is null;

-- ---------------------------------------------------------------------------
-- The trainer reads a linked client's own workouts
-- ---------------------------------------------------------------------------

drop policy if exists workout_logs_trainer_read_own on public.workout_logs;
create policy workout_logs_trainer_read_own on public.workout_logs
  for select to authenticated
  using (
    scheduled_workout_id is null
    and exists (
      select 1 from public.trainer_clients tc
      where tc.trainer_id = (select auth.uid()) and tc.client_id = workout_logs.client_id
    )
  );

drop policy if exists set_logs_trainer_read_own on public.set_logs;
create policy set_logs_trainer_read_own on public.set_logs
  for select to authenticated
  using (
    exists (
      select 1
      from public.workout_logs wl
      join public.trainer_clients tc on tc.client_id = wl.client_id
      where wl.id = set_logs.workout_log_id
        and wl.scheduled_workout_id is null
        and tc.trainer_id = (select auth.uid())
    )
  );

drop policy if exists exercise_adjustments_trainer_read_own on public.exercise_adjustments;
create policy exercise_adjustments_trainer_read_own on public.exercise_adjustments
  for select to authenticated
  using (
    exists (
      select 1
      from public.workout_logs wl
      join public.trainer_clients tc on tc.client_id = wl.client_id
      where wl.id = exercise_adjustments.workout_log_id
        and wl.scheduled_workout_id is null
        and tc.trainer_id = (select auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- The save
-- ---------------------------------------------------------------------------

create or replace function public.log_own_workout(
  p_log_id uuid,
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
  v_inserted integer;
begin
  if not exists (
    select 1 from public.profiles where id = (select auth.uid()) and role = 'client'
  ) then
    raise exception 'own_workout_clients_only';
  end if;

  insert into public.workout_logs (
    id, scheduled_workout_id, client_id, duration_seconds, effort_rating, client_note
  )
  values (
    p_log_id, null, (select auth.uid()), p_duration_seconds, p_effort_rating, p_client_note
  )
  on conflict (id) do nothing;
  get diagnostics v_inserted = row_count;

  if v_inserted = 0 then
    -- A retry after a save that already landed: hand it back. An id that
    -- isn't the caller's own log (RLS hides it) is refused.
    if not exists (select 1 from public.workout_logs where id = p_log_id and scheduled_workout_id is null) then
      raise exception 'workout_not_found';
    end if;
    return p_log_id;
  end if;

  insert into public.set_logs (workout_log_id, exercise_id, set_index, reps, weight, is_pr)
  select
    p_log_id,
    (s ->> 'exercise_id')::uuid,
    (s ->> 'set_index')::integer,
    (s ->> 'reps')::integer,
    (s ->> 'weight')::numeric,
    coalesce((s ->> 'is_pr')::boolean, false)
  from jsonb_array_elements(coalesce(p_sets, '[]'::jsonb)) as s;

  insert into public.exercise_adjustments (workout_log_id, exercise_id, action, swapped_for_exercise_id, reason)
  select
    p_log_id,
    (a ->> 'exercise_id')::uuid,
    a ->> 'action',
    (a ->> 'swapped_for_exercise_id')::uuid,
    a ->> 'reason'
  from jsonb_array_elements(coalesce(p_adjustments, '[]'::jsonb)) as a;

  return p_log_id;
end;
$$;

revoke all on function public.log_own_workout(uuid, integer, integer, text, jsonb, jsonb) from public, anon;
grant execute on function public.log_own_workout(uuid, integer, integer, text, jsonb, jsonb) to authenticated;
