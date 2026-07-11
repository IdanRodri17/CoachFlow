-- 0013_role_lock.sql — security hardening: lock profiles.role + consent stamps.
--
-- WHY: profiles_update_own (0001) is row-level with no column restriction, so
-- any signed-in user could PATCH their own profiles row with role='trainer'
-- straight through PostgREST (it passes the role check constraint) and
-- self-escalate into the trainer UI and role-gated functions such as
-- add_client_by_email (0004). Surfaced by the V12b security review; the hole
-- is pre-existing since V1, not a V12b regression.
--
-- HOW: a BEFORE UPDATE guard trigger (house pattern, see 0005c/0010) rather
-- than a column-level REVOKE — onboarding (app/(auth)/onboarding.tsx) and the
-- dev quick-switch (lib/devAuth.ts) both UPSERT the profile row *including*
-- role, and a revoke would break those same-value writes. `is distinct from`
-- lets same-value upserts through and blocks only actual changes.
--
-- The guard applies only to end-user connections (auth.uid() is not null):
-- the SQL Editor (postgres) and service_role carry no user JWT, so admin
-- corrections stay possible.

create or replace function public.prevent_profile_privilege_change()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is not null then
    if new.role is distinct from old.role then
      raise exception 'role cannot be changed';
    end if;
    -- Consent stamps may be set or refreshed, but never cleared (audit trail).
    if old.accepted_terms_at is not null and new.accepted_terms_at is null then
      raise exception 'accepted_terms_at cannot be cleared';
    end if;
    if old.accepted_health_disclaimer_at is not null and new.accepted_health_disclaimer_at is null then
      raise exception 'accepted_health_disclaimer_at cannot be cleared';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_profile_privilege_change on public.profiles;
create trigger trg_prevent_profile_privilege_change
  before update on public.profiles
  for each row execute function public.prevent_profile_privilege_change();
