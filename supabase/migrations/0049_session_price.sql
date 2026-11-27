-- 0049_session_price.sql — a finished session keeps the price it was done at
-- (U8; Idan, 2026-11-27: "from now on only").
--
-- WHY: every money figure priced sessions with the package's CURRENT price
-- (trainer_monthly_money, 0014, and the app's "owed" list), so changing a
-- client's price rewrote past months' income and what the client owed.
--
-- HOW:
--   * scheduled_workouts.price: the session's price, fixed when it's
--     completed (nullable; old app builds never write it).
--   * snapshot_session_price(), BEFORE INSERT OR UPDATE: completing a
--     session copies the package's price_per_session into it; leaving
--     completed clears it (an undo, a group untick — the next completion
--     prices it again); a session that isn't completed has none. Between
--     those, nobody changes it through the app or the API: a completed row
--     keeps the price it has, whatever an update sends (the client's own
--     update on completion can't set it either). SECURITY INVOKER: whoever
--     completes the session can read its package (packages_trainer_all /
--     packages_client_read). The SQL Editor (auth.uid() is null) stays free,
--     for corrections and the backfill below. Named trg_snapshot_* so it
--     runs after the trg_prevent_* guards.
--   * Backfill: every completed session gets its package's current price —
--     the best known — so history stops moving from today on.
--   * trainer_monthly_money: a session's own price when it has one, else the
--     package's current one (upcoming sessions, and completed ones that had
--     no price then: setting a price for the first time still fills those).
--     Same columns, same grants, still security_invoker.
--
-- Re-runnable.

alter table public.scheduled_workouts add column if not exists price numeric;

create or replace function public.snapshot_session_price()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.status = 'completed' and (tg_op = 'INSERT' or old.status is distinct from 'completed') then
    -- No package (or no row visible) leaves it null, as "no price set".
    select p.price_per_session into new.price
    from public.packages p
    where p.trainer_id = new.trainer_id
      and (
        (new.client_id is not null and p.client_id = new.client_id)
        or (new.managed_client_id is not null and p.managed_client_id = new.managed_client_id)
      )
    limit 1;
  elsif new.status is distinct from 'completed' then
    new.price := null;
  elsif tg_op = 'UPDATE' and (select auth.uid()) is not null then
    new.price := old.price;
  end if;
  return new;
end;
$$;

revoke execute on function public.snapshot_session_price() from public, anon, authenticated;

drop trigger if exists trg_snapshot_session_price on public.scheduled_workouts;
create trigger trg_snapshot_session_price
  before insert or update on public.scheduled_workouts
  for each row execute function public.snapshot_session_price();

update public.scheduled_workouts sw
set price = p.price_per_session
from public.packages p
where sw.status = 'completed'
  and sw.price is null
  and p.price_per_session is not null
  and p.trainer_id = sw.trainer_id
  and (p.client_id = sw.client_id or p.managed_client_id = sw.managed_client_id);

create or replace view public.trainer_monthly_money
with (security_invoker = true) as
with subject as (
  select
    sw.trainer_id,
    sw.scheduled_date,
    sw.status,
    sw.paid,
    sw.price,
    date_trunc('month', sw.scheduled_date)::date as month,
    coalesce(sw.client_id::text, 'm:' || sw.managed_client_id::text) as subject_key
  from public.scheduled_workouts sw
),
priced as (
  select
    s.trainer_id,
    s.scheduled_date,
    s.status,
    s.paid,
    s.month,
    s.subject_key,
    -- 0049: the session's own price once it's done; the package's otherwise.
    coalesce(s.price, p.price_per_session) as price_per_session
  from subject s
  left join public.packages p
    on p.trainer_id = s.trainer_id
    and coalesce(p.client_id::text, 'm:' || p.managed_client_id::text) = s.subject_key
)
select
  trainer_id,
  month,
  count(*) filter (where status = 'completed') as sessions_completed,
  coalesce(sum(price_per_session) filter (where status = 'completed'), 0) as earned,
  coalesce(sum(price_per_session) filter (where status = 'completed' and paid), 0) as paid_amount,
  coalesce(sum(price_per_session) filter (where status = 'completed' and not paid), 0) as unpaid,
  coalesce(sum(price_per_session) filter (where status = 'completed'), 0)
    + coalesce(sum(price_per_session) filter (
        where status = 'scheduled' and scheduled_date >= (now() at time zone 'Asia/Jerusalem')::date
      ), 0) as projected,
  count(distinct subject_key) filter (where price_per_session is null) as clients_without_price
from priced
group by trainer_id, month;

revoke all on public.trainer_monthly_money from anon, authenticated;
grant select on public.trainer_monthly_money to authenticated;
