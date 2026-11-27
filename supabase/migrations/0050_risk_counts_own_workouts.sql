-- 0050_risk_counts_own_workouts.sql — a client training on their own isn't
-- "gone quiet" (Idan, 2026-11-27: "yes, count them").
--
-- WHY: client_risk (0016/0018) read scheduled sessions only. Since 0047 a
-- client can log workouts of their own, and one who trained only that way
-- was flagged "gone quiet" on the trainer's Home and clients list.
--
-- HOW: the same view; gone_quiet now also needs no own workout (a workout
-- log with no scheduled session) in the last 10 days, Asia/Jerusalem, the
-- same window as before. missed_streak is unchanged: missing two sessions
-- the trainer scheduled still flags the client. security_invoker as before,
-- so a trainer only sees own workouts of clients linked to them (0047's
-- read policy). Same columns; trainer_attention reads it unchanged.
--
-- Re-runnable.

create or replace view public.client_risk
with (security_invoker = true) as
with today as (
  select (now() at time zone 'Asia/Jerusalem')::date as value
),
subjects as (
  select distinct
    scheduled_workouts.trainer_id,
    scheduled_workouts.client_id,
    scheduled_workouts.managed_client_id,
    coalesce(scheduled_workouts.client_id::text, 'm:' || scheduled_workouts.managed_client_id::text) as subject_key
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
  select recent_past.trainer_id, recent_past.subject_key
  from recent_past
  where recent_past.rn <= 2
  group by recent_past.trainer_id, recent_past.subject_key
  having count(*) = 2 and bool_and(recent_past.status <> 'completed')
),
gone_quiet as (
  select
    sw.trainer_id,
    coalesce(sw.client_id::text, 'm:' || sw.managed_client_id::text) as subject_key
  from public.scheduled_workouts sw, today
  where sw.status = 'completed'
  group by sw.trainer_id, coalesce(sw.client_id::text, 'm:' || sw.managed_client_id::text)
  having not bool_or(sw.scheduled_date > today.value - 10)
     and bool_or(sw.scheduled_date <= today.value - 10 and sw.scheduled_date > today.value - 40)
),
-- 0050: app clients with an own workout in the same 10 days.
own_recent as (
  select distinct wl.client_id
  from public.workout_logs wl, today
  where wl.scheduled_workout_id is null
    and (wl.completed_at at time zone 'Asia/Jerusalem')::date > today.value - 10
)
select
  s.trainer_id,
  s.client_id,
  s.managed_client_id,
  s.subject_key,
  case when ms.subject_key is not null then 'missed_streak' else 'gone_quiet' end as reason
from subjects s
left join missed_streak ms on ms.trainer_id = s.trainer_id and ms.subject_key = s.subject_key
left join gone_quiet gq on gq.trainer_id = s.trainer_id and gq.subject_key = s.subject_key
left join own_recent o on o.client_id = s.client_id
where ms.subject_key is not null
   or (gq.subject_key is not null and o.client_id is null);

revoke all on public.client_risk from anon, authenticated;
grant select on public.client_risk to authenticated;
