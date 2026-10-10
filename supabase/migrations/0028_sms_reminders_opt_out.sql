-- 0028_sms_reminders_opt_out.sql — redesign handoff B4: a client can turn
-- SMS reminders off.
--
-- profiles.sms_reminders_enabled, default true so every existing client
-- keeps getting reminders. The client flips it from the redesign's profile
-- screen (D28b) through profiles_update_own (0001) — no policy change.
--
-- due_sms_reminders (0019) now drops APP clients who turned it off.
-- Offline/managed clients have no app and no profile, so they're unaffected —
-- the trainer controls them by setting or clearing their phone. Same pattern
-- as trainer_daily_digest / daily_digest_enabled: the filter lives in the
-- view, so send-sms-reminders needs no change.
--
-- The view body is 0019's, unchanged apart from the opt-out filter on each
-- arm. Still security_invoker and still readable only by service_role (the
-- edge function) — revokes repeated from 0017/0019.
--
-- Re-runnable.

alter table public.profiles
  add column if not exists sms_reminders_enabled boolean not null default true;

create or replace view public.due_sms_reminders
with (security_invoker = true) as
with bounds as (
  select
    (now() at time zone 'Asia/Jerusalem')::date as today,
    (now() at time zone 'Asia/Jerusalem')::date + 1 as tomorrow,
    (now() at time zone 'Asia/Jerusalem')::time as local_now
)
select
  sw.id,
  sw.trainer_id,
  sw.client_id,
  sw.managed_client_id,
  sw.template_id,
  sw.scheduled_date,
  sw.scheduled_time,
  'day_before'::text as kind
from public.scheduled_workouts sw, bounds
where sw.status = 'scheduled'
  and sw.sms_reminded_at is null
  and sw.scheduled_date = bounds.tomorrow
  and bounds.local_now >= time '18:00'
  and (sw.client_id is null
       or exists (select 1 from public.profiles p where p.id = sw.client_id and p.sms_reminders_enabled))
union all
select
  sw.id,
  sw.trainer_id,
  sw.client_id,
  sw.managed_client_id,
  sw.template_id,
  sw.scheduled_date,
  sw.scheduled_time,
  'morning_of'::text as kind
from public.scheduled_workouts sw, bounds
where sw.status = 'scheduled'
  and sw.morning_sms_reminded_at is null
  and sw.scheduled_date = bounds.today
  and bounds.local_now >= time '07:00'
  and (sw.client_id is null
       or exists (select 1 from public.profiles p where p.id = sw.client_id and p.sms_reminders_enabled));

revoke all on public.due_sms_reminders from anon, authenticated;
