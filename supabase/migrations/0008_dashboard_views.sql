-- 0008_dashboard_views.sql — V8: trainer dashboard SQL views.
--
-- "Missed" is derived, not stored (SRS §4.1): a scheduled_workout counts as
-- missed on read when scheduled_date is before today (Asia/Jerusalem) and it
-- isn't completed. "Streak" = consecutive completed scheduled workouts; only a
-- missed one breaks it, days with no scheduled workout never do. We compute
-- "today" explicitly in Asia/Jerusalem — never rely on Postgres's session time
-- zone (UTC on Supabase) — so this matches lib/dates.ts exactly.
--
-- A "subject" is either an app client (client_id) or an offline/managed client
-- (managed_client_id) — exactly one is set per scheduled_workouts row (see
-- 0004b_managed_clients.sql). subject_key gives every roster member a single
-- non-null join/group key regardless of which kind they are (a plain SQL JOIN
-- on nullable columns would silently drop managed-client rows, since NULL = NULL
-- is never true).
--
-- `security_invoker = true` (Postgres 15+) makes these views enforce RLS as the
-- CALLING user, not the view owner — required so a trainer only ever sees rows
-- for scheduled_workouts they own, and a client only ever sees their own, exactly
-- per scheduled_workouts' existing RLS. No new RLS policies needed.
--
-- Re-runnable.

create or replace view public.client_streaks
with (security_invoker = true) as
with today as (
  select (now() at time zone 'Asia/Jerusalem')::date as value
),
base as (
  select
    sw.id as scheduled_id,
    sw.trainer_id,
    sw.client_id,
    sw.managed_client_id,
    coalesce(sw.client_id::text, 'm:' || sw.managed_client_id::text) as subject_key,
    sw.scheduled_date,
    sw.status,
    (sw.status <> 'completed' and sw.scheduled_date < today.value) as is_missed
  from public.scheduled_workouts sw, today
  where sw.scheduled_date <= today.value
),
flagged as (
  select
    *,
    -- Tiebreak on scheduled_id so same-day duplicates (e.g. two sessions in one
    -- day) get a deterministic, repeatable order rather than plan-dependent.
    sum(case when is_missed then 1 else 0 end) over (
      partition by trainer_id, subject_key
      order by scheduled_date desc, scheduled_id desc
      rows unbounded preceding
    ) as running_misses
  from base
)
select
  trainer_id,
  client_id,
  managed_client_id,
  subject_key,
  count(*) filter (where status = 'completed') as current_streak
from flagged
where running_misses = 0
group by trainer_id, client_id, managed_client_id, subject_key;

grant select on public.client_streaks to authenticated;

create or replace view public.client_workout_status
with (security_invoker = true) as
with today as (
  select (now() at time zone 'Asia/Jerusalem')::date as value
),
subjects as (
  select distinct
    trainer_id,
    client_id,
    managed_client_id,
    coalesce(client_id::text, 'm:' || managed_client_id::text) as subject_key
  from public.scheduled_workouts
),
today_row as (
  select
    coalesce(sw.client_id::text, 'm:' || sw.managed_client_id::text) as subject_key,
    bool_or(sw.status = 'completed') as completed_today
  from public.scheduled_workouts sw, today
  where sw.scheduled_date = today.value
  group by subject_key
),
overdue as (
  select
    coalesce(sw.client_id::text, 'm:' || sw.managed_client_id::text) as subject_key,
    count(*) as overdue_count
  from public.scheduled_workouts sw, today
  where sw.scheduled_date < today.value and sw.status <> 'completed'
  group by subject_key
),
-- The single oldest unresolved (overdue-or-today) workout — the one "mark
-- complete" acts on for an offline client, so the backlog clears oldest-first.
actionable as (
  select distinct on (subject_key)
    coalesce(sw.client_id::text, 'm:' || sw.managed_client_id::text) as subject_key,
    sw.id as actionable_id,
    sw.scheduled_date as actionable_date
  from public.scheduled_workouts sw, today
  where sw.scheduled_date <= today.value and sw.status <> 'completed'
  order by subject_key, sw.scheduled_date asc, sw.id asc
),
next_upcoming as (
  select distinct on (subject_key)
    coalesce(sw.client_id::text, 'm:' || sw.managed_client_id::text) as subject_key,
    sw.id as next_scheduled_id,
    sw.scheduled_date as next_scheduled_date,
    sw.scheduled_time as next_scheduled_time
  from public.scheduled_workouts sw, today
  where sw.scheduled_date >= today.value and sw.status = 'scheduled'
  order by subject_key, sw.scheduled_date asc, sw.scheduled_time asc nulls last
)
select
  s.trainer_id,
  s.client_id,
  s.managed_client_id,
  coalesce(t.completed_today, false) as completed_today,
  (t.subject_key is not null) as has_workout_today,
  coalesce(o.overdue_count, 0) > 0 as is_overdue,
  coalesce(o.overdue_count, 0) as overdue_count,
  a.actionable_id,
  a.actionable_date,
  n.next_scheduled_id,
  n.next_scheduled_date,
  n.next_scheduled_time
from subjects s
left join today_row t using (subject_key)
left join overdue o using (subject_key)
left join actionable a using (subject_key)
left join next_upcoming n using (subject_key);

grant select on public.client_workout_status to authenticated;
