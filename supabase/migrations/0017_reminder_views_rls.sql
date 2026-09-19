-- 0017_reminder_views_rls.sql — security fix: close a cross-tenant read on the
-- two reminder views.
--
-- THE BUG: due_reminders and due_sms_reminders (0011_reminders.sql) were the
-- only two views in this project created WITHOUT `with (security_invoker =
-- true)`. A plain view runs with its DEFINER's privileges (postgres), so the
-- RLS on scheduled_workouts never applies to reads through it. Supabase also
-- grants the `anon` and `authenticated` roles usage on the public schema by
-- default — so ANY caller holding the anon key (which ships inside every app
-- binary, by design) could read these views and get back rows belonging to
-- EVERY trainer, not just their own.
--
-- Exposure was bounded — only the rolling next-24h unreminded window, and only
-- UUIDs plus dates (no names, emails or phone numbers; those tables were and
-- are correctly protected) — but it was continuously pollable, so this is a
-- real cross-tenant leak and not a theoretical one.
--
-- 0011's own header explains the intent correctly ("Queried only by the
-- send-reminders edge function using the service role key, so no RLS grant to
-- authenticated here") — the code just never enforced it. This migration makes
-- the enforcement match the intent, two ways:
--
--   1. security_invoker = on  -> reads are evaluated as the CALLING user, so
--      scheduled_workouts' existing RLS applies and a trainer sees only their
--      own rows. Same setting every other view in this project already uses.
--   2. revoke from anon/authenticated -> defence in depth. Nothing in the app
--      reads these views; only the two edge functions do, and they use the
--      SERVICE ROLE key, which bypasses both RLS and these grants. So
--      revoking costs nothing and shuts the door even if (1) is ever lost.
--
-- 0011_reminders.sql has been patched with the same `security_invoker` clause
-- so re-running it (npm run db:seed / a fresh environment) can't silently
-- reintroduce the leak.
--
-- Re-runnable.

create or replace view public.due_reminders
with (security_invoker = true) as
select
  sw.id,
  sw.trainer_id,
  sw.client_id,
  sw.template_id,
  sw.scheduled_date,
  sw.scheduled_time
from public.scheduled_workouts sw
where sw.status = 'scheduled'
  and sw.reminded_at is null
  and sw.client_id is not null
  and (
    (sw.scheduled_date + coalesce(sw.scheduled_time, '00:00'::time)) at time zone 'Asia/Jerusalem'
  ) between now() and now() + interval '24 hours';

create or replace view public.due_sms_reminders
with (security_invoker = true) as
select
  sw.id,
  sw.trainer_id,
  sw.client_id,
  sw.managed_client_id,
  sw.template_id,
  sw.scheduled_date,
  sw.scheduled_time
from public.scheduled_workouts sw
where sw.status = 'scheduled'
  and sw.sms_reminded_at is null
  and (
    (sw.scheduled_date + coalesce(sw.scheduled_time, '00:00'::time)) at time zone 'Asia/Jerusalem'
  ) between now() and now() + interval '24 hours';

revoke all on public.due_reminders from anon, authenticated;
revoke all on public.due_sms_reminders from anon, authenticated;
