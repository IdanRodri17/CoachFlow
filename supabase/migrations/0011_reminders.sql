-- 0011_reminders.sql — V11: email reminders + WhatsApp deep link + SMS reminders.
--
-- reminded_at: nullable, set once send-reminders emails a client for a given
-- scheduled_workout, so a second cron run never double-sends.
--
-- contact_phone / phone: a trainer-entered phone number for WhatsApp reminders.
-- Neither auth mode exposes a client's real phone to the trainer's client-side
-- session (SMS OTP stores it in auth.users, admin-only; managed clients have
-- no phone at all) — so this is a simple, trainer-owned contact field, not
-- tied to auth. Lives on trainer_clients (app clients) / managed_clients
-- (offline clients), both already trainer-scoped by RLS — no new policies
-- needed for these columns.
--
-- due_reminders: server-side "who needs a reminder right now" — computes the
-- 24h window with scheduled_date/scheduled_time interpreted in Asia/Jerusalem
-- (never the DB session's default UTC), matching every other date rule in
-- this app (SRS §2.3). App clients only (client_id not null) — offline
-- clients have no email to remind. Queried only by the send-reminders edge
-- function using the service role key, so no RLS grant to authenticated here.
--
-- Re-runnable.

alter table public.scheduled_workouts add column if not exists reminded_at timestamptz;
alter table public.trainer_clients add column if not exists contact_phone text;
alter table public.managed_clients add column if not exists phone text;

create or replace view public.due_reminders as
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

-- sms_reminded_at: tracked separately from reminded_at (email) so the two
-- channels are independent — a client with both an email and a phone gets
-- both reminders, and either channel failing/being unavailable never blocks
-- the other.
--
-- due_sms_reminders: same 24h/Asia-Jerusalem window as due_reminders, but
-- NOT restricted to client_id — offline/managed clients have no email but DO
-- have a phone (managed_clients.phone), so SMS reaches both roster kinds.
-- The send-sms-reminders function resolves the actual phone number (from
-- trainer_clients.contact_phone or managed_clients.phone) itself.
alter table public.scheduled_workouts add column if not exists sms_reminded_at timestamptz;

create or replace view public.due_sms_reminders as
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
