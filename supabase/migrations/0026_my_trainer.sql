-- 0026_my_trainer.sql — redesign handoff B1: a client can see who their
-- trainer is.
--
-- WHY: profiles RLS has only profiles_select_own and
-- profiles_trainer_reads_roster (trainer → client direction), so a client
-- can't read even their own trainer's name. The share card's "trained by"
-- line has been silently empty because of it, and the redesign's client
-- screens (D22 Today, D28b profile, D28c share card) need the name, the
-- business name and a way to message the trainer.
--
-- my_trainer() returns exactly one row for the CALLER only — the latest
-- ACTIVE trainer_clients link — and takes no arguments, so it can't be
-- pointed at anyone else. Rather than a broad "client reads trainer profile"
-- policy, it exposes just these five fields.
--
-- The trainer's phone is their auth.users.phone (they sign in by SMS),
-- shown in the local 05X… form like accept_invite (0020) stores it. Showing
-- it to the trainer's OWN clients was approved by Idan on 2026-10-01; nobody
-- else can reach it.
--
-- Re-runnable.

create or replace function public.my_trainer()
returns table (
  id uuid,
  display_name text,
  business_name text,
  phone text,
  linked_since timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    p.display_name,
    p.business_name,
    case
      when u.phone is null or u.phone = '' then null
      when u.phone like '972%' then '0' || substr(u.phone, 4)
      else u.phone
    end,
    tc.created_at
  from public.trainer_clients tc
  join public.profiles p on p.id = tc.trainer_id
  left join auth.users u on u.id = tc.trainer_id
  where tc.client_id = auth.uid() and tc.status = 'active'
  order by tc.created_at desc
  limit 1;
$$;

revoke all on function public.my_trainer() from public, anon;
grant execute on function public.my_trainer() to authenticated;
