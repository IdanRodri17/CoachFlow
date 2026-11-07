-- 0039_volume_milestones.sql — V28: how much a client has lifted, against a
-- ladder of real objects.
--
-- client_volume: one row per subject (an app client, or an offline client
-- the trainer logs for) with total_kg = Σ reps × weight over every logged
-- set, and month_kg = the same for logs completed this calendar month in
-- Asia/Jerusalem. Sets only exist under a workout log, which only a completed
-- workout has, so this is volume over completed workouts. Bodyweight sets
-- (weight null) add nothing. Derived on read, never stored — the same
-- discipline as streaks (SRS §4.1).
--
-- security_invoker: a client reads their own logs (every trainer's), a
-- trainer the logs of the workouts they scheduled (0005, 0032) — so the
-- trainer Home's "your clients lifted …" is their clients' volume in their
-- own sessions. Granted to authenticated only (CLAUDE.md view rule).
--
-- The ladder itself (motorbike 0.2 t, car 1.5 t, elephant 6 t, bus 12 t,
-- blue whale 150 t) lives in lib/volume.ts; crossing a rung awards a badge
-- through lib/badges.ts, so badges.type gains the five volume_* types.
--
-- Re-runnable.

create or replace view public.client_volume
with (security_invoker = true) as
with bounds as (
  select date_trunc('month', now() at time zone 'Asia/Jerusalem')::date as month_start
)
select
  wl.client_id,
  wl.managed_client_id,
  coalesce(wl.client_id::text, 'm:' || wl.managed_client_id::text) as subject_key,
  coalesce(sum(coalesce(sl.reps, 0) * coalesce(sl.weight, 0)), 0) as total_kg,
  coalesce(
    sum(coalesce(sl.reps, 0) * coalesce(sl.weight, 0))
      filter (where (wl.completed_at at time zone 'Asia/Jerusalem')::date >= b.month_start),
    0
  ) as month_kg
from public.set_logs sl
join public.workout_logs wl on wl.id = sl.workout_log_id
cross join bounds b
group by wl.client_id, wl.managed_client_id;

revoke all on public.client_volume from anon, authenticated;
grant select on public.client_volume to authenticated;

alter table public.badges drop constraint if exists badges_type_check;
alter table public.badges add constraint badges_type_check check (
  type in (
    'first_workout', 'streak_10', 'first_month',
    'volume_motorbike', 'volume_car', 'volume_elephant', 'volume_bus', 'volume_whale'
  )
);
