-- 0018_client_risk_fix.sql — bug fix for V16's client_risk view.
--
-- THE BUG (in the original 0016_client_risk.sql): the recent_past CTE selected
-- workouts with `scheduled_date <= today`, but the missed_streak test required
-- `scheduled_date < today` (the locked SRS §4.1 rule — a workout dated today
-- isn't missed yet). So if a client had a workout scheduled for TODAY, that
-- row took rn=1, could never satisfy the missed test, `bool_and` collapsed to
-- false, and the client was silently NOT flagged — even when their two most
-- recent genuinely-past workouts were both missed. The radar went quiet
-- exactly when the client was most at risk.
--
-- THE FIX: restrict recent_past to STRICTLY past workouts. The `scheduled_date
-- < today` term inside bool_and then becomes redundant and is dropped, so
-- "missed" reduces to "not completed" — which is correct, because every row
-- reaching that point is already past.
--
-- 0016_client_risk.sql has been patched with the same change so a fresh
-- environment (npm run db:seed) builds the correct view from the start; this
-- migration exists so an ALREADY-APPLIED database gets fixed too.
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
  where sw.scheduled_date < today.value
),
missed_streak as (
  select trainer_id, subject_key
  from recent_past
  where rn <= 2
  group by trainer_id, subject_key
  having
    count(*) = 2
    and bool_and(status <> 'completed')
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
