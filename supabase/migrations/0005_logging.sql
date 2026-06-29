-- 0005_logging.sql — V5: workout logging.
--
-- When a client performs a scheduled workout, they create a `workout_log` (one
-- per session) with `set_logs` underneath (one per set). RLS is client-scoped:
-- the client owns their logs; the trainer can READ logs for workouts they
-- assigned. We also grant the client the few reads/updates the logging screen
-- needs (the template's exercises, and flipping the workout to 'completed').
--
-- effort_rating / client_note are part of the SRS schema but get populated in V6
-- — added here nullable so V6 doesn't need a schema change.
--
-- Re-runnable.

create table if not exists public.workout_logs (
  id uuid primary key default gen_random_uuid(),
  scheduled_workout_id uuid not null references public.scheduled_workouts (id) on delete cascade,
  client_id uuid not null references public.profiles (id) on delete cascade,
  completed_at timestamptz not null default now(),
  effort_rating integer check (effort_rating between 1 and 10),
  client_note text,
  duration_seconds integer,
  created_at timestamptz not null default now()
);

create index if not exists workout_logs_scheduled_idx on public.workout_logs (scheduled_workout_id);
create index if not exists workout_logs_client_idx on public.workout_logs (client_id);

alter table public.workout_logs enable row level security;

-- Client owns their logs.
drop policy if exists "workout_logs_client_all" on public.workout_logs;
create policy "workout_logs_client_all" on public.workout_logs
  for all to authenticated
  using (auth.uid() = client_id)
  with check (auth.uid() = client_id);

-- Trainer can read logs for workouts they assigned.
drop policy if exists "workout_logs_trainer_read" on public.workout_logs;
create policy "workout_logs_trainer_read" on public.workout_logs
  for select to authenticated
  using (
    exists (
      select 1 from public.scheduled_workouts sw
      where sw.id = workout_logs.scheduled_workout_id and sw.trainer_id = auth.uid()
    )
  );

create table if not exists public.set_logs (
  id uuid primary key default gen_random_uuid(),
  workout_log_id uuid not null references public.workout_logs (id) on delete cascade,
  exercise_id uuid not null references public.exercises (id) on delete cascade,
  set_index integer not null,
  reps integer,
  weight numeric,
  is_pr boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists set_logs_workout_log_idx on public.set_logs (workout_log_id);
create index if not exists set_logs_exercise_idx on public.set_logs (exercise_id);

alter table public.set_logs enable row level security;

-- Client owns set_logs under their own workout_logs.
drop policy if exists "set_logs_client_all" on public.set_logs;
create policy "set_logs_client_all" on public.set_logs
  for all to authenticated
  using (
    exists (
      select 1 from public.workout_logs wl
      where wl.id = set_logs.workout_log_id and wl.client_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.workout_logs wl
      where wl.id = set_logs.workout_log_id and wl.client_id = auth.uid()
    )
  );

-- Trainer can read set_logs for workouts they assigned.
drop policy if exists "set_logs_trainer_read" on public.set_logs;
create policy "set_logs_trainer_read" on public.set_logs
  for select to authenticated
  using (
    exists (
      select 1
      from public.workout_logs wl
      join public.scheduled_workouts sw on sw.id = wl.scheduled_workout_id
      where wl.id = set_logs.workout_log_id and sw.trainer_id = auth.uid()
    )
  );

-- The client needs to flip their own scheduled workout to 'completed'.
drop policy if exists "scheduled_workouts_client_update" on public.scheduled_workouts;
create policy "scheduled_workouts_client_update" on public.scheduled_workouts
  for update to authenticated
  using (auth.uid() = client_id)
  with check (auth.uid() = client_id);

-- The client needs to read the exercises of a template assigned to them
-- (template_exercises was trainer-only in V3).
drop policy if exists "template_exercises_client_read" on public.template_exercises;
create policy "template_exercises_client_read" on public.template_exercises
  for select to authenticated
  using (
    exists (
      select 1 from public.scheduled_workouts sw
      where sw.template_id = template_exercises.template_id and sw.client_id = auth.uid()
    )
  );
