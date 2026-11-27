-- 0048_client_archive.sql — a trainer can archive a client (U5; Idan,
-- 2026-11-27: "archive only").
--
-- WHY: there was no way to take a client off the list; it only grew. A
-- client who stopped training kept showing in the list, the schedule
-- pickers and Home.
--
-- HOW: archived_at on both kinds of client — trainer_clients (app clients;
-- status stays as it is, my_trainer() reads 'active') and managed_clients
-- (offline). Nothing is deleted except the client's UPCOMING sessions: their
-- history, workouts, package and money stay, and archived_at = null brings
-- them back. The app hides archived clients from the list (an "ארכיון"
-- filter shows them), the pickers and Home's attention feed; names in past
-- sessions and in Money still resolve.
--
-- set_client_archived() does both in one transaction: stamps (or clears)
-- archived_at and, when archiving, deletes the client's sessions that are
-- still 'scheduled' from today on (Asia/Jerusalem). SECURITY INVOKER, so it
-- goes through the trainer's own RLS: trainer_clients_trainer_update,
-- managed_clients_owner_all, scheduled_workouts_trainer_all. Completed
-- sessions can't be deleted anyway (0036). Past sessions that were never
-- done stay as history (missed). Returns how many sessions it removed.
--
-- An app client keeps their link to the trainer (consent is theirs to
-- withdraw, R15) and sees their history as before.
--
-- Re-runnable.

alter table public.trainer_clients add column if not exists archived_at timestamptz;
alter table public.managed_clients add column if not exists archived_at timestamptz;

create or replace function public.set_client_archived(
  p_kind text,
  p_ref_id uuid,
  p_archived boolean
)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Asia/Jerusalem')::date;
  v_removed integer := 0;
begin
  if p_kind = 'app' then
    update public.trainer_clients
    set archived_at = case when p_archived then coalesce(archived_at, now()) else null end
    where trainer_id = (select auth.uid()) and client_id = p_ref_id;
  elsif p_kind = 'managed' then
    update public.managed_clients
    set archived_at = case when p_archived then coalesce(archived_at, now()) else null end
    where trainer_id = (select auth.uid()) and id = p_ref_id;
  else
    raise exception 'bad_client_kind';
  end if;
  if not found then
    raise exception 'client_not_found';
  end if;

  if p_archived then
    delete from public.scheduled_workouts
    where trainer_id = (select auth.uid())
      and status = 'scheduled'
      and scheduled_date >= v_today
      and (
        (p_kind = 'app' and client_id = p_ref_id)
        or (p_kind = 'managed' and managed_client_id = p_ref_id)
      );
    get diagnostics v_removed = row_count;
  end if;

  return v_removed;
end;
$$;

revoke all on function public.set_client_archived(text, uuid, boolean) from public, anon;
grant execute on function public.set_client_archived(text, uuid, boolean) to authenticated;
