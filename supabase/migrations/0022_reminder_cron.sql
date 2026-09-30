-- 0022_reminder_cron.sql — V18: SMS reminders actually run, on a schedule
-- that lives in the repo instead of a dashboard click.
--
-- WHY: send-sms-reminders was deployed code with no trigger, so no reminder
-- was ever sent automatically (roadmap §3-A).
--
-- WHY HOURLY: since 0019 the reminder views are date-based with local-time
-- gates (day-before from 18:00, morning-of from 07:00, Asia/Jerusalem), and
-- the sms_reminded_at / morning_sms_reminded_at stamps make every send
-- once-only. An hourly run fires each gate within the hour it opens, and a run
-- with nothing due costs one query. pg_cron runs in UTC; the local-time logic
-- is entirely in the views, so DST needs no special handling here.
--
-- WHY ONLY SMS: send-reminders (email) and send-trainer-digest (email) are
-- deliberately NOT scheduled. Login is SMS-only (V18c): new users have no
-- email address, and the existing accounts' addresses are placeholders. Both
-- functions stay deployed; scheduling one later is a single cron.schedule().
--
-- AUTH: the job sends an x-cron-secret header; send-sms-reminders checks it
-- through verify_cron_secret() below, so the secret never leaves the
-- database. The function is deployed with verify_jwt = false — its old gate
-- was the gateway JWT check, which anyone holding the public anon key passes.
--
-- ENVIRONMENT SETUP (once per project, NOT in this file because the values
-- are project-specific). Two Vault secrets, created from the SQL Editor:
--   select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
--   select vault.create_secret(encode(uuid_send(gen_random_uuid()) || uuid_send(gen_random_uuid()), 'hex'), 'cron_secret');
--
-- SHIPS PAUSED: the job is created with active = false so nothing is sent
-- before the smoke test. Turn it on with:
--   select cron.alter_job((select jobid from cron.job where jobname = 'send-sms-reminders-hourly'), active := true);
-- Run once by hand (same code path as the job):
--   select public.invoke_sms_reminders();
-- See what the function answered (pg_net is async):
--   select status_code, content, created from net._http_response order by created desc limit 5;
--
-- Re-runnable.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- True when p_secret matches the Vault's cron_secret. Called by the edge
-- function with its service-role client; no app role can call it.
create or replace function public.verify_cron_secret(p_secret text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from vault.decrypted_secrets
    where name = 'cron_secret' and decrypted_secret = p_secret
  );
$$;

revoke all on function public.verify_cron_secret(text) from public, anon, authenticated;
grant execute on function public.verify_cron_secret(text) to service_role;

-- One run of send-sms-reminders. The cron job calls this; so can you, from
-- the SQL Editor, to trigger a run by hand. Returns pg_net's request id.
create or replace function public.invoke_sms_reminders()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
  v_request_id bigint;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'cron_secret';
  if v_url is null or v_secret is null then
    raise exception 'Vault secrets project_url / cron_secret are missing — see the header of 0022_reminder_cron.sql';
  end if;

  select net.http_post(
    url := v_url || '/functions/v1/send-sms-reminders',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  ) into v_request_id;
  return v_request_id;
end;
$$;

revoke all on function public.invoke_sms_reminders() from public, anon, authenticated;

-- (Re)create the hourly job, paused.
select cron.unschedule(jobid) from cron.job where jobname = 'send-sms-reminders-hourly';
select cron.schedule('send-sms-reminders-hourly', '0 * * * *', 'select public.invoke_sms_reminders()');
select cron.alter_job(
  (select jobid from cron.job where jobname = 'send-sms-reminders-hourly'),
  active := false
);
