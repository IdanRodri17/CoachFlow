-- 0003_templates.sql — V3: reusable workout templates.
--
-- A `workout_template` is a reusable workout the trainer builds once (name +
-- notes). Its `template_exercises` are the ordered exercises in it, each with
-- target sets/reps/weight/rest. Both are TRAINER-ONLY in V3 (the owner). Later
-- versions add client read access where scheduling/logging needs it.
--
-- Re-runnable (create if not exists + drop policy if exists).

create table if not exists public.workout_templates (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  description text,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists workout_templates_trainer_id_idx on public.workout_templates (trainer_id);

alter table public.workout_templates enable row level security;

-- The owning trainer has full CRUD on their own templates.
drop policy if exists "workout_templates_owner_all" on public.workout_templates;
create policy "workout_templates_owner_all" on public.workout_templates
  for all to authenticated
  using (auth.uid() = trainer_id)
  with check (auth.uid() = trainer_id);

create table if not exists public.template_exercises (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.workout_templates (id) on delete cascade,
  exercise_id uuid not null references public.exercises (id) on delete cascade,
  position integer not null default 0,
  target_sets integer,
  target_reps integer,
  target_weight numeric,
  rest_seconds integer,
  created_at timestamptz not null default now()
);

create index if not exists template_exercises_template_id_idx on public.template_exercises (template_id);

alter table public.template_exercises enable row level security;

-- A template_exercise is accessible only to the trainer who owns its parent
-- template (checked via the workout_templates row).
drop policy if exists "template_exercises_owner_all" on public.template_exercises;
create policy "template_exercises_owner_all" on public.template_exercises
  for all to authenticated
  using (
    exists (
      select 1 from public.workout_templates t
      where t.id = template_id and t.trainer_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.workout_templates t
      where t.id = template_id and t.trainer_id = auth.uid()
    )
  );
