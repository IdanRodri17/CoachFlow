-- 0005b_exercise_adjustments.sql — V5b: swap / skip an exercise (with a reason).
--
-- During an unsupervised workout the client may SKIP an exercise (no sets) or
-- SWAP it for a substitute (logs the substitute's sets). Either way we record an
-- `exercise_adjustments` row so the reason surfaces to the trainer. Client-owned
-- (via the parent workout_log); the trainer can read adjustments for workouts
-- they assigned.
--
-- Re-runnable.

create table if not exists public.exercise_adjustments (
  id uuid primary key default gen_random_uuid(),
  workout_log_id uuid not null references public.workout_logs (id) on delete cascade,
  exercise_id uuid not null references public.exercises (id) on delete cascade,
  action text not null check (action in ('skipped', 'swapped')),
  swapped_for_exercise_id uuid references public.exercises (id) on delete set null,
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists exercise_adjustments_workout_log_idx
  on public.exercise_adjustments (workout_log_id);

alter table public.exercise_adjustments enable row level security;

-- Client owns adjustments under their own workout_logs.
drop policy if exists "exercise_adjustments_client_all" on public.exercise_adjustments;
create policy "exercise_adjustments_client_all" on public.exercise_adjustments
  for all to authenticated
  using (
    exists (
      select 1 from public.workout_logs wl
      where wl.id = exercise_adjustments.workout_log_id and wl.client_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.workout_logs wl
      where wl.id = exercise_adjustments.workout_log_id and wl.client_id = auth.uid()
    )
  );

-- Trainer can read adjustments for workouts they assigned.
drop policy if exists "exercise_adjustments_trainer_read" on public.exercise_adjustments;
create policy "exercise_adjustments_trainer_read" on public.exercise_adjustments
  for select to authenticated
  using (
    exists (
      select 1
      from public.workout_logs wl
      join public.scheduled_workouts sw on sw.id = wl.scheduled_workout_id
      where wl.id = exercise_adjustments.workout_log_id and sw.trainer_id = auth.uid()
    )
  );
