-- 0043_uncomplete_returns_session.sql — setting a completed workout back to
-- scheduled gives its session back to the package.
--
-- WHY: trg_increment_used_sessions (0010) counted only the change TO
-- completed. A trainer can set a workout back to scheduled (unticking
-- someone on a group's attendance sheet, 0035; any undo, which 0036 keeps
-- open), and used_sessions kept the session: the client's package showed one
-- session fewer left for every untick. SRS §4.1 defines used_sessions as one
-- per completed workout, so leaving completed has to count too.
--
-- HOW: the same trigger and function, now both ways:
--   * to completed       → +1 on the package of the row's client (new.*);
--   * from completed     → −1 on the package of the client it was charged to
--                          (old.*), never below 0 (a package reset since then
--                          has nothing to give back);
--   * anything else (paid, notes, time, completed → completed) → no change.
-- The name stays increment_used_sessions so the trigger, 0024's revoke and
-- everything else that names it keep working. Still SECURITY DEFINER, for the
-- same reason as in 0010: an app client completing their own workout can't
-- update their package under RLS.
--
-- Next free number after this: 0044. (0040–0042 belong to the release branch.)
--
-- Re-runnable.

create or replace function public.increment_used_sessions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'completed' and old.status is distinct from 'completed' then
    if new.client_id is not null then
      update public.packages
      set used_sessions = used_sessions + 1
      where trainer_id = new.trainer_id and client_id = new.client_id;
    elsif new.managed_client_id is not null then
      update public.packages
      set used_sessions = used_sessions + 1
      where trainer_id = new.trainer_id and managed_client_id = new.managed_client_id;
    end if;
  elsif old.status = 'completed' and new.status is distinct from 'completed' then
    if old.client_id is not null then
      update public.packages
      set used_sessions = greatest(used_sessions - 1, 0)
      where trainer_id = old.trainer_id and client_id = old.client_id;
    elsif old.managed_client_id is not null then
      update public.packages
      set used_sessions = greatest(used_sessions - 1, 0)
      where trainer_id = old.trainer_id and managed_client_id = old.managed_client_id;
    end if;
  end if;
  return new;
end;
$$;

-- As in 0024: only the trigger calls it.
revoke execute on function public.increment_used_sessions() from public, anon, authenticated;
