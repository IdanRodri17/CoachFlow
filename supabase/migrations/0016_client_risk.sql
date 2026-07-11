-- 0016_client_risk.sql — V16: client retention radar.
--
-- Flags, per (trainer, subject_key), an at-risk client with a reason —
-- derived on read only (SRS §4.1 discipline: no stored flags, no cron, same
-- as client_streaks in 0008_dashboard_views.sql). "Missed" reuses the exact
-- locked definition: status <> 'completed' and scheduled_date < today
-- (Asia/Jerusalem) — a workout scheduled for today is never "missed" even if
-- not yet done.
--
--   - 'missed_streak': the subject's 2 most recent PAST-OR-TODAY scheduled
--     workouts both exist and are both derived-missed. A subject with fewer
--     than 2 such workouts (including brand-new clients with no history) is
--     never flagged this way.
--   - 'gone_quiet': no completed workout in the last 10 days, despite at
--     least one completed workout in the 30 days before that (days 11-40
--     ago) — i.e. they were active a month ago and have since stopped.
--
-- security_invoker = true so a trainer only ever sees rows their existing
-- scheduled_workouts RLS already lets them see — no new policies needed.
--
-- Re-runnable.

create or replace view public.client_risk
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
recent_past as (
  select
    sw.trainer_id,
    coalesce(sw.client_id::text, 'm:' || sw.managed_client_id::text) as subject_key,
    sw.status,
    sw.scheduled_date,
    row_number() over (
      partition by sw.trainer_id, coalesce(sw.client_id::text, 'm:' || sw.managed_client_id::text)
      order by sw.scheduled_date desc, sw.id desc
    ) as rn
  from public.scheduled_workouts sw, today
  where sw.scheduled_date <= today.value
),
missed_streak as (
  select trainer_id, subject_key
  from recent_past
  where rn <= 2
  group by trainer_id, subject_key
  having
    count(*) = 2
    and bool_and(status <> 'completed' and scheduled_date < (select value from today))
),
gone_quiet as (
  select
    sw.trainer_id,
    coalesce(sw.client_id::text, 'm:' || sw.managed_client_id::text) as subject_key
  from public.scheduled_workouts sw, today
  where sw.status = 'completed'
  group by sw.trainer_id, subject_key
  having
    not bool_or(sw.scheduled_date > today.value - 10)
    and bool_or(sw.scheduled_date <= today.value - 10 and sw.scheduled_date > today.value - 40)
)
select
  s.trainer_id,
  s.client_id,
  s.managed_client_id,
  s.subject_key,
  case
    when ms.subject_key is not null then 'missed_streak'
    else 'gone_quiet'
  end as reason
from subjects s
left join missed_streak ms on ms.trainer_id = s.trainer_id and ms.subject_key = s.subject_key
left join gone_quiet gq on gq.trainer_id = s.trainer_id and gq.subject_key = s.subject_key
where ms.subject_key is not null or gq.subject_key is not null;

grant select on public.client_risk to authenticated;
