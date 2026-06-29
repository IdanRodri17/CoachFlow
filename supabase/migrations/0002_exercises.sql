-- 0002_exercises.sql — V2: the exercise library.
--
-- An `exercises` row is a piece of TRAINER content: a movement (name, muscle
-- group, a demo video URL, default sets/reps). The trainer owns and edits their
-- own exercises; clients browse them read-only and watch the demo videos.
--
-- Re-runnable (create if not exists + drop policy if exists).

create table if not exists public.exercises (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  description text,
  muscle_group text,
  video_url text,
  thumbnail_url text,
  default_sets integer,
  default_reps integer,
  created_at timestamptz not null default now()
);

create index if not exists exercises_trainer_id_idx on public.exercises (trainer_id);

alter table public.exercises enable row level security;

-- The owning trainer can do everything with their own exercises (CRUD).
drop policy if exists "exercises_owner_all" on public.exercises;
create policy "exercises_owner_all" on public.exercises
  for all to authenticated
  using (auth.uid() = trainer_id)
  with check (auth.uid() = trainer_id);

-- Any signed-in user can READ exercises so clients can browse the library.
-- NOTE: V1 is single-trainer, so this is fine for now. V4 introduces the
-- `trainer_clients` roster; at that point TIGHTEN this SELECT policy to only
-- expose a trainer's exercises to clients on that trainer's roster.
drop policy if exists "exercises_read_authenticated" on public.exercises;
create policy "exercises_read_authenticated" on public.exercises
  for select to authenticated
  using (true);
