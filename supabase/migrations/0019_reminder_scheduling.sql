-- 0019_reminder_scheduling.sql — V17: morning-of reminders + trainer daily digest.
--
-- WHAT CHANGES AND WHY:
--
-- 1. The day-before window is now DATE-based, not a rolling 24 hours.
--    V11's due_reminders fired for anything "within the next 24 hours". Once a
--    morning-of reminder exists that window double-fires: a workout today at
--    17:00 is still "within 24h" when the 07:00 morning job runs, so the client
--    would get both. Redefining day-before as `scheduled_date = tomorrow` and
--    morning-of as `scheduled_date = today` makes the two windows disjoint by
--    construction, and matches how a person actually describes it. Both dates
--    resolve in Asia/Jerusalem (SRS §2.3), never the DB session's UTC.
--
-- 1b. Each arm ALSO gates on local time of day (day-before from 18:00,
--    morning-of from 07:00, Asia/Jerusalem). V11's rolling window was
--    self-anchoring — "within 24h of now" could only match near the session —
--    so the hourly cron the functions document was harmless. A date-only
--    predicate has no such anchor: under that same hourly cron every reminder
--    would fire just after local midnight (pg_cron is UTC and Israel's offset
--    is a whole number of hours, so `0 * * * *` lands exactly on 00:00 local).
--    The time gate puts the send back where a human would expect it while
--    keeping the cron dumb and the jobs idempotent — once the row's stamp
--    column is set, later ticks skip it.
--    Known edge: a session before 07:00 gets its morning nudge at 07:00, i.e.
--    after it started. It still got the day-before one. Gating on
--    "not yet started" instead would mean a 06:00 session never matches at
--    all, which is worse.
--
-- 2. Each view now emits a `kind` column ('day_before' | 'morning_of') instead
--    of us adding a second view per channel. One view per channel, two kinds —
--    the edge function stamps whichever tracking column matches the kind.
--    (`create or replace view` only permits ADDING columns at the end, which is
--    why `kind` is last.)
--
-- 3. morning_reminded_at / morning_sms_reminded_at track the morning-of send
--    separately from V11's reminded_at / sms_reminded_at, for the same reason
--    those two are separate from each other: one channel or timing failing must
--    never suppress another. Four columns is the honest cost of 2 channels × 2
--    timings.
--
-- 4. profiles.daily_digest_enabled — trainer opt-out for the new morning digest
--    (Profile > Notifications). Defaulted true so existing trainers get it
--    without a backfill, and so older app builds that never send the column
--    keep working. Writable through the existing profiles_update_own policy;
--    0013's guard trigger only protects role + consent stamps, so no new policy
--    and no trigger change is needed.
--
-- 5. trainer_daily_digest — today's sessions per trainer, already filtered to
--    trainers who haven't opted out. Returns IDs only; the edge function
--    resolves names, same division of labour as the other reminder views.
--
-- security_invoker = true on every view (see 0017 for why that is load-bearing).
--
-- Re-runnable.

alter table public.scheduled_workouts
  add column if not exists morning_reminded_at timestamptz;
alter table public.scheduled_workouts
  add column if not exists morning_sms_reminded_at timestamptz;

alter table public.profiles
  add column if not exists daily_digest_enabled boolean not null default true;

-- Backfill: suppress the morning nudge for sessions that have ALREADY started.
-- The two columns above land null on every existing row, so without this,
-- applying the migration at (say) 21:00 makes every still-'scheduled' session
-- from earlier today instantly due — and the first cron tick would tell those
-- clients "your workout is today at 08:00", thirteen hours late. Past sessions
-- routinely sit at status='scheduled' because "missed" is derived, never
-- stored (SRS §4.1), so this is the normal case, not an edge one.
--
-- Deliberately time-aware rather than blanket: sessions still AHEAD of us
-- today keep their null stamp and do get a morning nudge, which is correct —
-- if you push at 09:00 and a client trains at 17:00, they should hear about
-- it. Also what makes this statement safe to re-run: a later run can only
-- ever suppress sessions that have since started, which is the same decision
-- it would make the first time.
update public.scheduled_workouts
   set morning_reminded_at     = coalesce(morning_reminded_at, now()),
       morning_sms_reminded_at = coalesce(morning_sms_reminded_at, now())
 where scheduled_date = (now() at time zone 'Asia/Jerusalem')::date
   and coalesce(scheduled_time, time '00:00') <= (now() at time zone 'Asia/Jerusalem')::time;

-- --------------------------------------------------------------------------
-- Moving a session must re-arm its reminders.
--
-- All four arms are gated on `<stamp> is null` with no memory of WHICH date the
-- stamp was written for. So a session that already got its reminders and is
-- then moved to a new date would silently get none for the new one — worst for
-- an SMS-only offline client, who has no app to check and is never told.
--
-- Done as a trigger, not per screen: scheduled_date is written from several
-- places, and a DB-level rule can't be forgotten by the next one. Same-timing
-- triggers fire in alphabetical order, and `trg_reset_...` sorts after
-- 0005c's `trg_prevent_client_reschedule`, so an illegal client reschedule is
-- still rejected before this ever runs.
-- --------------------------------------------------------------------------
create or replace function public.reset_reminder_stamps_on_reschedule()
returns trigger
language plpgsql
as $$
begin
  if new.scheduled_date is distinct from old.scheduled_date then
    new.reminded_at := null;
    new.sms_reminded_at := null;
    new.morning_reminded_at := null;
    new.morning_sms_reminded_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_reset_reminder_stamps on public.scheduled_workouts;
create trigger trg_reset_reminder_stamps
  before update on public.scheduled_workouts
  for each row execute function public.reset_reminder_stamps_on_reschedule();

-- --------------------------------------------------------------------------
-- Email reminders (app clients only — offline clients have no email).
-- --------------------------------------------------------------------------
create or replace view public.due_reminders
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
  sw.template_id,
  sw.scheduled_date,
  sw.scheduled_time,
  'day_before'::text as kind
from public.scheduled_workouts sw, bounds
where sw.status = 'scheduled'
  and sw.client_id is not null
  and sw.reminded_at is null
  and sw.scheduled_date = bounds.tomorrow
  and bounds.local_now >= time '18:00'
union all
select
  sw.id,
  sw.trainer_id,
  sw.client_id,
  sw.template_id,
  sw.scheduled_date,
  sw.scheduled_time,
  'morning_of'::text as kind
from public.scheduled_workouts sw, bounds
where sw.status = 'scheduled'
  and sw.client_id is not null
  and sw.morning_reminded_at is null
  and sw.scheduled_date = bounds.today
  and bounds.local_now >= time '07:00';

-- --------------------------------------------------------------------------
-- SMS reminders (reaches app clients AND offline/managed clients — SMS only
-- needs a phone number, not an account).
-- --------------------------------------------------------------------------
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
  and bounds.local_now >= time '07:00';

-- --------------------------------------------------------------------------
-- Trainer daily digest — every session the trainer has TODAY, including
-- already-completed ones (the digest is a morning plan, so it is sent before
-- anything is completed; status travels along so the message can note it if
-- the job is ever run later in the day).
-- --------------------------------------------------------------------------
create or replace view public.trainer_daily_digest
with (security_invoker = true) as
select
  sw.trainer_id,
  sw.id as scheduled_workout_id,
  sw.client_id,
  sw.managed_client_id,
  sw.template_id,
  sw.scheduled_date,
  sw.scheduled_time,
  sw.status
from public.scheduled_workouts sw
join public.profiles p on p.id = sw.trainer_id
where sw.scheduled_date = (now() at time zone 'Asia/Jerusalem')::date
  and p.daily_digest_enabled;

-- Same defence-in-depth as 0017: nothing in the app reads these; only the edge
-- functions do, and they use the service role (which bypasses both RLS and
-- these grants). CREATE OR REPLACE VIEW preserves existing ACLs, so this is
-- belt-and-braces for the two views 0017 already revoked, and the real grant
-- for the new one.
revoke all on public.due_reminders from anon, authenticated;
revoke all on public.due_sms_reminders from anon, authenticated;
revoke all on public.trainer_daily_digest from anon, authenticated;
