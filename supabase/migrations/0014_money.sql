-- 0014_money.sql — V13: trainer cash-flow dashboard.
--
-- packages.price_per_session: what the trainer charges that client per
-- session. Nullable — older packages (and clients with no price set yet)
-- keep working; the view surfaces the gap via clients_without_price rather
-- than silently treating them as free.
--
-- trainer_monthly_money: one row per (trainer, month), month keyed off
-- scheduled_date (already a plain `date`, i.e. already the user-local
-- calendar date per SRS §4.1 — no time-zone conversion needed for the
-- grouping itself). "Today" for the projected/remaining-scheduled figure
-- IS a moving target, so that one uses the locked
-- (now() at time zone 'Asia/Jerusalem')::date pattern, same as
-- 0008_dashboard_views.sql. Uses the same subject_key join as the dashboard
-- views so app and offline/managed clients both count. security_invoker so
-- a trainer only ever sees rows their existing scheduled_workouts/packages
-- RLS already lets them see — no new policies needed.
--
-- Re-runnable.

alter table public.packages
  add column if not exists price_per_session numeric;

create or replace view public.trainer_monthly_money
with (security_invoker = true) as
with subject as (
  select
    sw.trainer_id,
    sw.scheduled_date,
    sw.status,
    sw.paid,
    date_trunc('month', sw.scheduled_date)::date as month,
    coalesce(sw.client_id::text, 'm:' || sw.managed_client_id::text) as subject_key
  from public.scheduled_workouts sw
),
priced as (
  select
    s.*,
    p.price_per_session
  from subject s
  left join public.packages p
    on p.trainer_id = s.trainer_id
    and coalesce(p.client_id::text, 'm:' || p.managed_client_id::text) = s.subject_key
)
select
  trainer_id,
  month,
  count(*) filter (where status = 'completed') as sessions_completed,
  coalesce(sum(price_per_session) filter (where status = 'completed'), 0) as earned,
  coalesce(sum(price_per_session) filter (where status = 'completed' and paid), 0) as paid_amount,
  coalesce(sum(price_per_session) filter (where status = 'completed' and not paid), 0) as unpaid,
  coalesce(sum(price_per_session) filter (where status = 'completed'), 0)
    + coalesce(sum(price_per_session) filter (
        where status = 'scheduled' and scheduled_date >= (now() at time zone 'Asia/Jerusalem')::date
      ), 0) as projected,
  count(distinct subject_key) filter (where price_per_session is null) as clients_without_price
from priced
group by trainer_id, month;

grant select on public.trainer_monthly_money to authenticated;
