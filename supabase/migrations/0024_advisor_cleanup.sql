-- 0024_advisor_cleanup.sql — V19 hygiene: clear the Supabase security
-- advisor's leftover warnings, so a real one can't hide among them.
--
-- 1) increment_used_sessions() (0010) is SECURITY DEFINER and — like every new
--    function in `public` — was auto-granted EXECUTE to anon/authenticated,
--    so the advisor lists it as callable at /rest/v1/rpc/increment_used_sessions.
--    It's a trigger function, and Postgres refuses to run one outside a
--    trigger, so nothing was actually exposed; the grant is simply wrong.
--    Revoking it doesn't affect trg_increment_used_sessions: EXECUTE is
--    checked when a trigger is created, not each time it fires.
--
-- 2) Three trigger functions had no pinned search_path, so a caller's
--    search_path could change what their unqualified names resolve to. They
--    only touch NEW/OLD columns and the schema-qualified auth.uid(), so
--    pinning `public` changes no behaviour.
--
-- Not addressed here: "leaked password protection" — there are no passwords
-- any more (SMS-only, V18c). The create_invite / accept_invite warnings are
-- intended: signed-in users must be able to call them.
--
-- Re-runnable.

revoke execute on function public.increment_used_sessions() from public, anon, authenticated;

alter function public.prevent_client_reschedule() set search_path = public;
alter function public.prevent_profile_privilege_change() set search_path = public;
alter function public.reset_reminder_stamps_on_reschedule() set search_path = public;
