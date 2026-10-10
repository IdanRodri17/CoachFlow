-- 0032_managed_client_logging.sql — V17 Step 6: an offline (managed) client
-- can have a real workout, progress and check-ins recorded — by the trainer.
--
-- The product's differentiator is that a trainer's WHOLE book lives in the
-- app, including clients who'll never install it. Until now those clients
-- could be scheduled, completed and billed, but nothing could be recorded
-- about the workout itself.
--
-- Same XOR pattern as scheduled_workouts_one_client / packages_one_client:
-- workout_logs, progress_entries and check_ins get a nullable
-- managed_client_id beside a now-nullable client_id, and exactly one is set.
-- workout_logs.logged_by records who physically entered the row; it defaults
-- to the caller, so older app builds fill it without knowing it exists, and
-- existing rows are backfilled with their client (only clients could log).
--
-- RLS — every existing policy stays exactly as it was:
--   * client policies match auth.uid() = client_id, which never matches a
--     managed row (null is never equal to anything).
--   * NEW trainer policies cover ONLY rows with managed_client_id set, owned
--     by the caller. A trainer still has no write access to an app client's
--     logs; reading them is unchanged (the existing *_trainer_read policies).
--   * set_logs / exercise_adjustments reach their subject through
--     workout_logs → scheduled_workouts.trainer_id, the path the existing
--     trainer read policies already use.
--   * progress-photos storage: a trainer may manage files under their own
--     managed clients' folders ("<managed_client_id>/…"), mirroring the
--     client's "<auth.uid()>/…" rule.
--
-- No view or function reads these tables' client_id (checked 2026-10-10);
-- trainer_attention (0029) reaches subjects through scheduled_workouts, so
-- managed adjustments and PRs show up there with no change.
--
-- Re-runnable.

-- ---------------------------------------------------------------------------
-- workout_logs
-- ---------------------------------------------------------------------------

alter table public.workout_logs alter column client_id drop not null;
alter table public.workout_logs
  add column if not exists managed_client_id uuid references public.managed_clients (id) on delete cascade;
alter table public.workout_logs
  add column if not exists logged_by uuid default auth.uid() references public.profiles (id) on delete set null;

update public.workout_logs set logged_by = client_id where logged_by is null and client_id is not null;

alter table public.workout_logs drop constraint if exists workout_logs_one_client;
alter table public.workout_logs add constraint workout_logs_one_client
  check ((client_id is not null) <> (managed_client_id is not null));

create index if not exists workout_logs_managed_client_idx
  on public.workout_logs (managed_client_id) where managed_client_id is not null;

-- The log, its managed client and its scheduled workout must all be the
-- caller's, and the scheduled workout must be for that same managed client.
drop policy if exists workout_logs_trainer_managed_all on public.workout_logs;
create policy workout_logs_trainer_managed_all on public.workout_logs
  for all to authenticated
  using (
    managed_client_id is not null
    and exists (
      select 1 from public.managed_clients mc
      where mc.id = workout_logs.managed_client_id and mc.trainer_id = (select auth.uid())
    )
    and exists (
      select 1 from public.scheduled_workouts sw
      where sw.id = workout_logs.scheduled_workout_id
        and sw.trainer_id = (select auth.uid())
        and sw.managed_client_id = workout_logs.managed_client_id
    )
  )
  with check (
    managed_client_id is not null
    and logged_by = (select auth.uid())
    and exists (
      select 1 from public.managed_clients mc
      where mc.id = workout_logs.managed_client_id and mc.trainer_id = (select auth.uid())
    )
    and exists (
      select 1 from public.scheduled_workouts sw
      where sw.id = workout_logs.scheduled_workout_id
        and sw.trainer_id = (select auth.uid())
        and sw.managed_client_id = workout_logs.managed_client_id
    )
  );

-- ---------------------------------------------------------------------------
-- set_logs and exercise_adjustments: through their workout log
-- ---------------------------------------------------------------------------

drop policy if exists set_logs_trainer_managed_all on public.set_logs;
create policy set_logs_trainer_managed_all on public.set_logs
  for all to authenticated
  using (
    exists (
      select 1
      from public.workout_logs wl
      join public.scheduled_workouts sw on sw.id = wl.scheduled_workout_id
      where wl.id = set_logs.workout_log_id
        and wl.managed_client_id is not null
        and sw.trainer_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.workout_logs wl
      join public.scheduled_workouts sw on sw.id = wl.scheduled_workout_id
      where wl.id = set_logs.workout_log_id
        and wl.managed_client_id is not null
        and sw.trainer_id = (select auth.uid())
    )
  );

drop policy if exists exercise_adjustments_trainer_managed_all on public.exercise_adjustments;
create policy exercise_adjustments_trainer_managed_all on public.exercise_adjustments
  for all to authenticated
  using (
    exists (
      select 1
      from public.workout_logs wl
      join public.scheduled_workouts sw on sw.id = wl.scheduled_workout_id
      where wl.id = exercise_adjustments.workout_log_id
        and wl.managed_client_id is not null
        and sw.trainer_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.workout_logs wl
      join public.scheduled_workouts sw on sw.id = wl.scheduled_workout_id
      where wl.id = exercise_adjustments.workout_log_id
        and wl.managed_client_id is not null
        and sw.trainer_id = (select auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- progress_entries
-- ---------------------------------------------------------------------------

alter table public.progress_entries alter column client_id drop not null;
alter table public.progress_entries
  add column if not exists managed_client_id uuid references public.managed_clients (id) on delete cascade;

alter table public.progress_entries drop constraint if exists progress_entries_one_client;
alter table public.progress_entries add constraint progress_entries_one_client
  check ((client_id is not null) <> (managed_client_id is not null));

create index if not exists progress_entries_managed_client_idx
  on public.progress_entries (managed_client_id) where managed_client_id is not null;

drop policy if exists progress_entries_trainer_managed_all on public.progress_entries;
create policy progress_entries_trainer_managed_all on public.progress_entries
  for all to authenticated
  using (
    managed_client_id is not null
    and exists (
      select 1 from public.managed_clients mc
      where mc.id = progress_entries.managed_client_id and mc.trainer_id = (select auth.uid())
    )
  )
  with check (
    managed_client_id is not null
    and exists (
      select 1 from public.managed_clients mc
      where mc.id = progress_entries.managed_client_id and mc.trainer_id = (select auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- check_ins
-- ---------------------------------------------------------------------------

alter table public.check_ins alter column client_id drop not null;
alter table public.check_ins
  add column if not exists managed_client_id uuid references public.managed_clients (id) on delete cascade;

alter table public.check_ins drop constraint if exists check_ins_one_client;
alter table public.check_ins add constraint check_ins_one_client
  check ((client_id is not null) <> (managed_client_id is not null));

-- One check-in per week per subject: the app side already has
-- unique (client_id, week_start); this is the managed twin.
create unique index if not exists check_ins_managed_week_key
  on public.check_ins (managed_client_id, week_start) where managed_client_id is not null;

drop policy if exists check_ins_trainer_managed_all on public.check_ins;
create policy check_ins_trainer_managed_all on public.check_ins
  for all to authenticated
  using (
    managed_client_id is not null
    and exists (
      select 1 from public.managed_clients mc
      where mc.id = check_ins.managed_client_id and mc.trainer_id = (select auth.uid())
    )
  )
  with check (
    managed_client_id is not null
    and exists (
      select 1 from public.managed_clients mc
      where mc.id = check_ins.managed_client_id and mc.trainer_id = (select auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- progress-photos storage: "<managed_client_id>/…" belongs to its trainer
-- ---------------------------------------------------------------------------

drop policy if exists progress_photos_trainer_managed_all on storage.objects;
create policy progress_photos_trainer_managed_all on storage.objects
  for all to authenticated
  using (
    bucket_id = 'progress-photos'
    and exists (
      select 1 from public.managed_clients mc
      where mc.id::text = (storage.foldername(objects.name))[1] and mc.trainer_id = (select auth.uid())
    )
  )
  with check (
    bucket_id = 'progress-photos'
    and exists (
      select 1 from public.managed_clients mc
      where mc.id::text = (storage.foldername(objects.name))[1] and mc.trainer_id = (select auth.uid())
    )
  );
