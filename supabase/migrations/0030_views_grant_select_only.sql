-- 0030_views_grant_select_only.sql — playbook Step 2f: the four older app
-- views get the CLAUDE.md view rule.
--
-- client_workout_status (0008), client_streaks (0008), trainer_monthly_money
-- (0014) and client_risk (0016/0018) predate the rule and still carry
-- Supabase's default grants: ALL privileges to anon AND authenticated.
-- They are security_invoker and none of them is updatable, so nothing could
-- actually be read or written through those grants — this closes the gap on
-- principle, before a future edit to one of them makes it real.
--
-- After: anon has nothing; authenticated has SELECT only (the app reads all
-- four); service_role is untouched. Same shape as 0029's trainer_attention.
--
-- Re-runnable.

revoke all on public.client_workout_status from anon, authenticated;
grant select on public.client_workout_status to authenticated;

revoke all on public.client_streaks from anon, authenticated;
grant select on public.client_streaks to authenticated;

revoke all on public.trainer_monthly_money from anon, authenticated;
grant select on public.trainer_monthly_money to authenticated;

revoke all on public.client_risk from anon, authenticated;
grant select on public.client_risk to authenticated;
