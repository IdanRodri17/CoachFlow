-- 0040_ai_usage.sql — daily cap on AI calls per trainer (release R9).
--
-- supabase/functions/nutrition-suggest spends real money on every call. This
-- counts calls per trainer per Asia/Jerusalem day so the function can refuse
-- the 21st with HTTP 429 and keep Anthropic spend bounded.
--
-- ai_usage has RLS on and NO policies, and no grants to the app roles: only
-- the service role (the edge function) touches it.

create table if not exists public.ai_usage (
  trainer_id uuid not null references public.profiles(id) on delete cascade,
  day        date not null,
  calls      int  not null default 0,
  primary key (trainer_id, day)
);

alter table public.ai_usage enable row level security;
revoke all on public.ai_usage from anon, authenticated;

-- Atomically counts one call and returns true, or returns false (counting
-- nothing) when the trainer already used p_cap calls today. The single
-- INSERT .. ON CONFLICT DO UPDATE .. WHERE is one statement, so concurrent
-- calls serialize on the row lock and can't overshoot the cap. FOUND is false
-- when the WHERE skipped the update. (plpgsql because Postgres rejects a
-- data-modifying WITH nested inside exists().)
create or replace function public.consume_ai_call(p_trainer uuid, p_cap int)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  insert into public.ai_usage (trainer_id, day, calls)
  values (p_trainer, (now() at time zone 'Asia/Jerusalem')::date, 1)
  on conflict (trainer_id, day)
  do update set calls = public.ai_usage.calls + 1
  where public.ai_usage.calls < p_cap;
  return found;
end;
$$;

-- Only the edge function (service role) calls this, so a client can't burn or
-- reset another trainer's quota.
revoke all on function public.consume_ai_call(uuid, int) from public, anon, authenticated;
grant execute on function public.consume_ai_call(uuid, int) to service_role;
