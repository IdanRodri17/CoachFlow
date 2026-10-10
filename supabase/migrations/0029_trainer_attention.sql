-- 0029_trainer_attention.sql — redesign handoff B2 / roadmap V25: the
-- trainer Home's "לתשומת לבך" feed, in one view.
--
-- REPLACES roadmap Step 16 (the separate client_renewal view and renewals
-- card) and the Home's at-risk card: one feed of everything a trainer should
-- look at, one row per item.
--
-- Kinds:
--   risk             client_risk (0016/0018) — detail = its reason code
--                    ('missed_streak' | 'gone_quiet').
--   package_low      total_sessions − used_sessions ≤ 2.
--   package_used_up  ≤ 0 left AND a 'scheduled' workout dated today or later —
--                    sessions are being given away. Replaces package_low for
--                    that client.
--   adjustment       an exercise skipped/swapped WITH a reason, last 7 days —
--                    detail = the reason, plus action + exercise_name.
--   pr               personal records, last 7 days, ONE row per workout —
--                    detail = "<first PR's exercise> <weight>", plus
--                    exercise_name / weight / item_count (PRs in that workout)
--                    so the app can format "ועוד N" in its own language.
--
-- Rules carried from the roadmap and SRS §4.1:
--   * Derived on read — no stored flags, no cron. "Today" and "last 7 days"
--     are Asia/Jerusalem (7 local days including today).
--   * Only a completed workout uses up a session (0010's trigger); a late
--     cancel or no-show never does (decided 2026-09-30) — nothing here
--     touches used_sessions.
--   * Subjects come from scheduled_workouts / packages, so offline clients
--     appear too (packages, risk now; adjustments / PRs once V17 lets them
--     have logs). subject_key = client_id, or 'm:' || managed_client_id.
--
-- Security: security_invoker, so every source keeps its own RLS, AND the
-- final filter trainer_id = auth.uid() — a client querying the view gets
-- nothing (not even items about themselves, like their own risk label).
-- Granted to authenticated only, revoked from anon.
--
-- Re-runnable.

create or replace view public.trainer_attention
with (security_invoker = true) as
with today as (
  select (now() at time zone 'Asia/Jerusalem')::date as value
),
pkg as (
  select
    p.trainer_id,
    p.client_id,
    p.managed_client_id,
    p.total_sessions - p.used_sessions as sessions_left,
    exists (
      select 1
      from public.scheduled_workouts sw, today
      where sw.trainer_id = p.trainer_id
        and sw.status = 'scheduled'
        and sw.scheduled_date >= today.value
        and (sw.client_id = p.client_id or sw.managed_client_id = p.managed_client_id)
    ) as has_upcoming
  from public.packages p
),
prs as (
  select
    sw.trainer_id,
    sw.client_id,
    sw.managed_client_id,
    coalesce(wl.completed_at, wl.created_at) as happened_at,
    count(*)::int as pr_count,
    (array_agg(e.name order by sl.created_at, sl.set_index))[1] as first_exercise,
    (array_agg(sl.weight order by sl.created_at, sl.set_index))[1] as first_weight
  from public.set_logs sl
  join public.workout_logs wl on wl.id = sl.workout_log_id
  join public.scheduled_workouts sw on sw.id = wl.scheduled_workout_id
  left join public.exercises e on e.id = sl.exercise_id
  cross join today
  where sl.is_pr
    and (coalesce(wl.completed_at, wl.created_at) at time zone 'Asia/Jerusalem')::date >= today.value - 6
  group by sw.trainer_id, sw.client_id, sw.managed_client_id, wl.id, wl.completed_at, wl.created_at
),
items as (
  select
    r.trainer_id,
    'risk'::text as kind,
    r.client_id,
    r.managed_client_id,
    r.subject_key,
    r.reason as detail,
    null::text as action,
    null::text as exercise_name,
    null::numeric as weight,
    null::int as item_count,
    null::int as sessions_left,
    null::timestamptz as happened_at
  from public.client_risk r

  union all

  select
    pkg.trainer_id,
    case when pkg.sessions_left <= 0 and pkg.has_upcoming then 'package_used_up' else 'package_low' end,
    pkg.client_id,
    pkg.managed_client_id,
    coalesce(pkg.client_id::text, 'm:' || pkg.managed_client_id::text),
    null,
    null,
    null,
    null,
    null,
    pkg.sessions_left,
    null
  from pkg
  where pkg.sessions_left <= 2

  union all

  select
    sw.trainer_id,
    'adjustment',
    sw.client_id,
    sw.managed_client_id,
    coalesce(sw.client_id::text, 'm:' || sw.managed_client_id::text),
    trim(ea.reason),
    ea.action,
    e.name,
    null,
    null,
    null,
    ea.created_at
  from public.exercise_adjustments ea
  join public.workout_logs wl on wl.id = ea.workout_log_id
  join public.scheduled_workouts sw on sw.id = wl.scheduled_workout_id
  left join public.exercises e on e.id = ea.exercise_id
  cross join today
  where nullif(trim(ea.reason), '') is not null
    and (ea.created_at at time zone 'Asia/Jerusalem')::date >= today.value - 6

  union all

  select
    prs.trainer_id,
    'pr',
    prs.client_id,
    prs.managed_client_id,
    coalesce(prs.client_id::text, 'm:' || prs.managed_client_id::text),
    concat_ws(' ', prs.first_exercise, trim_scale(prs.first_weight)::text),
    null,
    prs.first_exercise,
    trim_scale(prs.first_weight),
    prs.pr_count,
    null,
    prs.happened_at
  from prs
)
select *
from items
where items.trainer_id = (select auth.uid());

-- Supabase's default privileges grant ALL on new public objects to anon and
-- authenticated; take that back and give authenticated read-only.
revoke all on public.trainer_attention from anon, authenticated;
grant select on public.trainer_attention to authenticated;
