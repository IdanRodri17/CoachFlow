-- 0004_scheduling.sql — V4: roster + workout scheduling.
--
-- Adds:
--   * trainer_clients  — the trainer's roster (who their clients are).
--   * scheduled_workouts — a template assigned to a client on a date.
--   * add_client_by_email() — a secure way for a trainer to add a client by
--     email (the app can't read auth.users directly, so this runs as definer).
--   * a few RLS policies so the roster, client home, and (now roster-scoped)
--     exercise browsing all work.
--
-- "Missed" is NOT stored (SRS §4.1): scheduled_workouts.status is only
-- 'scheduled' or 'completed'. Missed is derived on read (date < today & not done).
--
-- Re-runnable.

-- ---------------------------------------------------------------------------
-- Roster
-- ---------------------------------------------------------------------------
create table if not exists public.trainer_clients (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references public.profiles (id) on delete cascade,
  client_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'paused')),
  created_at timestamptz not null default now(),
  unique (trainer_id, client_id)
);

alter table public.trainer_clients enable row level security;

-- Trainer manages their own roster.
drop policy if exists "trainer_clients_trainer_all" on public.trainer_clients;
create policy "trainer_clients_trainer_all" on public.trainer_clients
  for all to authenticated
  using (auth.uid() = trainer_id)
  with check (auth.uid() = trainer_id);

-- A client can read their own roster membership (needed by the policies below).
drop policy if exists "trainer_clients_client_read" on public.trainer_clients;
create policy "trainer_clients_client_read" on public.trainer_clients
  for select to authenticated
  using (auth.uid() = client_id);

-- ---------------------------------------------------------------------------
-- Scheduled workouts
-- ---------------------------------------------------------------------------
create table if not exists public.scheduled_workouts (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references public.profiles (id) on delete cascade,
  client_id uuid not null references public.profiles (id) on delete cascade,
  -- Keep the row if the template is later deleted (preserves history); show a
  -- fallback name in the UI. (Exception to the default on-delete-cascade rule.)
  template_id uuid references public.workout_templates (id) on delete set null,
  scheduled_date date not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'completed')),
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists scheduled_workouts_client_date_idx
  on public.scheduled_workouts (client_id, scheduled_date);
create index if not exists scheduled_workouts_trainer_date_idx
  on public.scheduled_workouts (trainer_id, scheduled_date);

alter table public.scheduled_workouts enable row level security;

-- Trainer manages the scheduled workouts they created.
drop policy if exists "scheduled_workouts_trainer_all" on public.scheduled_workouts;
create policy "scheduled_workouts_trainer_all" on public.scheduled_workouts
  for all to authenticated
  using (auth.uid() = trainer_id)
  with check (auth.uid() = trainer_id);

-- A client can read their own scheduled workouts.
drop policy if exists "scheduled_workouts_client_read" on public.scheduled_workouts;
create policy "scheduled_workouts_client_read" on public.scheduled_workouts
  for select to authenticated
  using (auth.uid() = client_id);

-- ---------------------------------------------------------------------------
-- A trainer can read the profiles of clients on their roster (for names).
-- ---------------------------------------------------------------------------
drop policy if exists "profiles_trainer_reads_roster" on public.profiles;
create policy "profiles_trainer_reads_roster" on public.profiles
  for select to authenticated
  using (
    exists (
      select 1 from public.trainer_clients tc
      where tc.trainer_id = auth.uid() and tc.client_id = profiles.id
    )
  );

-- ---------------------------------------------------------------------------
-- A client can read templates that have been scheduled to them (for the name
-- on their home screen).
-- ---------------------------------------------------------------------------
drop policy if exists "workout_templates_client_read" on public.workout_templates;
create policy "workout_templates_client_read" on public.workout_templates
  for select to authenticated
  using (
    exists (
      select 1 from public.scheduled_workouts sw
      where sw.template_id = workout_templates.id and sw.client_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- Tighten exercise reads to roster-scoped (the V2 TODO, now that the roster
-- exists): the owner trainer, OR a client on that trainer's roster.
-- ---------------------------------------------------------------------------
drop policy if exists "exercises_read_authenticated" on public.exercises;
drop policy if exists "exercises_read_roster" on public.exercises;
create policy "exercises_read_roster" on public.exercises
  for select to authenticated
  using (
    auth.uid() = trainer_id
    or exists (
      select 1 from public.trainer_clients tc
      where tc.trainer_id = exercises.trainer_id and tc.client_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- add_client_by_email(): a trainer adds a client to their roster by email.
-- SECURITY DEFINER so it can look up auth.users (the app role cannot).
-- ---------------------------------------------------------------------------
create or replace function public.add_client_by_email(p_email text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client_id uuid;
begin
  -- Caller must be a trainer.
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'trainer') then
    raise exception 'Only trainers can add clients.';
  end if;

  -- Find the user by email.
  select id into v_client_id from auth.users where lower(email) = lower(trim(p_email)) limit 1;
  if v_client_id is null then
    raise exception 'No user found with that email. Ask them to sign up first.';
  end if;

  -- They must have a client profile.
  if not exists (select 1 from public.profiles where id = v_client_id and role = 'client') then
    raise exception 'That user is not a client.';
  end if;

  -- Add to the roster (idempotent).
  insert into public.trainer_clients (trainer_id, client_id, status)
  values (auth.uid(), v_client_id, 'active')
  on conflict (trainer_id, client_id) do nothing;
end;
$$;

grant execute on function public.add_client_by_email(text) to authenticated;
