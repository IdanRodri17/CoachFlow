-- 0020_client_invites.sql — V18b: a trainer can only link a client who agrees.
--
-- WHY: a trainer_clients row is what unlocks a client's data for a trainer —
-- profile + intake (0004 profiles_trainer_reads_roster, 0012), weight and
-- measurements (0007), progress photos (0007 storage policy), check-ins
-- (0010). Until now such a row could be created with no consent at all:
--   * add_client_by_email (0004) links any registered client by email, and is
--     executable by every role including anon. Its distinct errors also told
--     the caller whether an email was registered and as which role.
--   * trainer_clients_trainer_all (0004) is FOR ALL with only
--     `auth.uid() = trainer_id`, so ANY signed-in user (even a client) could
--     insert a roster row straight through PostgREST, or repoint an existing
--     row's client_id at someone else.
--   * scheduled_workouts_trainer_all (0004) let a trainer schedule a workout
--     for any client id — a stranger's workout on your Home, and whatever you
--     logged against it readable by them (0005 workout_logs_trainer_read).
--
-- WHAT:
--   1. client_invites + create_invite() / accept_invite(). The client typing
--      the trainer's code IS the consent, and accept_invite() is now the only
--      way a trainer_clients row gets created.
--   2. trainer_clients: FOR ALL replaced by select / update / delete (no
--      insert), plus a guard trigger so neither id of an existing row can
--      change (house pattern: 0013's guard trigger).
--   3. add_client_by_email: kept for history, executable by nobody.
--   4. scheduled_workouts: a trainer may only write rows for their own roster
--      clients or their own managed clients. Checked on the live DB before
--      shipping: 0 existing rows violate this.
--
-- Why a 6-character code is enough: a guessed code only lets the guesser add
-- THEMSELVES to that trainer's roster (visible to the trainer, removable) — it
-- never exposes anyone else's data. Single-use and 7-day expiry on top.
--
-- Re-runnable.

-- ---------------------------------------------------------------------------
-- 1) Invites
-- ---------------------------------------------------------------------------
create table if not exists public.client_invites (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references public.profiles (id) on delete cascade,
  code text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  used_at timestamptz,
  used_by uuid references public.profiles (id) on delete set null
);

create index if not exists client_invites_trainer_idx
  on public.client_invites (trainer_id, created_at desc);

alter table public.client_invites enable row level security;
revoke all on public.client_invites from anon;

-- A trainer sees their own invites and may cancel a pending one. There is no
-- insert/update policy on purpose: rows are created and stamped only by the
-- two security-definer functions below.
drop policy if exists "client_invites_trainer_read" on public.client_invites;
create policy "client_invites_trainer_read" on public.client_invites
  for select to authenticated
  using (auth.uid() = trainer_id);

drop policy if exists "client_invites_trainer_delete" on public.client_invites;
create policy "client_invites_trainer_delete" on public.client_invites
  for delete to authenticated
  using (auth.uid() = trainer_id and used_at is null);

-- create_invite(): the calling trainer gets a fresh single-use code.
create or replace function public.create_invite()
returns public.client_invites
language plpgsql
security definer
set search_path = public
as $$
declare
  -- 31 symbols with no 0/O or 1/I/L, so a code survives being read aloud.
  v_alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_bytes bytea;
  v_code text;
  v_invite public.client_invites;
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'trainer') then
    raise exception 'Only trainers can create invites.';
  end if;

  loop
    -- gen_random_uuid() draws from the server's cryptographic RNG; bytes 0–5
    -- of a v4 uuid are fully random (version/variant bits sit in 6 and 8).
    -- No pgcrypto needed.
    v_bytes := uuid_send(gen_random_uuid());
    v_code := '';
    for i in 0..5 loop
      v_code := v_code || substr(v_alphabet, 1 + get_byte(v_bytes, i) % length(v_alphabet), 1);
    end loop;

    begin
      insert into public.client_invites (trainer_id, code)
      values (auth.uid(), v_code)
      returning * into v_invite;
      return v_invite;
    exception when unique_violation then
      -- Collision with an existing code: draw again.
    end;
  end loop;
end;
$$;

-- accept_invite(): links the CALLER (never anyone else) to the code's trainer.
-- One generic error for wrong / used / expired, so codes can't be probed.
create or replace function public.accept_invite(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.client_invites;
  v_phone text;
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'client') then
    raise exception 'Only clients can accept an invite.';
  end if;

  select * into v_invite
  from public.client_invites
  where code = upper(trim(p_code)) and used_at is null and expires_at > now()
  for update;
  if not found then
    raise exception 'Invalid or expired invite code.';
  end if;

  insert into public.trainer_clients (trainer_id, client_id, status)
  values (v_invite.trainer_id, auth.uid(), 'active')
  on conflict (trainer_id, client_id) do nothing;

  update public.client_invites
  set used_at = now(), used_by = auth.uid()
  where id = v_invite.id;

  -- The client signed in by SMS, so we already know their number: prefill the
  -- trainer's contact phone (reminders, WhatsApp) in the local 05X… form the
  -- trainer would have typed. auth.users stores it as 9725XXXXXXXX.
  select phone into v_phone from auth.users where id = auth.uid();
  if v_phone is not null and v_phone <> '' then
    update public.trainer_clients
    set contact_phone = case when v_phone like '972%' then '0' || substr(v_phone, 4) else v_phone end
    where trainer_id = v_invite.trainer_id and client_id = auth.uid() and contact_phone is null;
  end if;

  return v_invite.trainer_id;
end;
$$;

revoke all on function public.create_invite() from public, anon;
revoke all on function public.accept_invite(text) from public, anon;
grant execute on function public.create_invite() to authenticated;
grant execute on function public.accept_invite(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2) trainer_clients: no direct inserts, no repointing
-- ---------------------------------------------------------------------------
drop policy if exists "trainer_clients_trainer_all" on public.trainer_clients;

drop policy if exists "trainer_clients_trainer_read" on public.trainer_clients;
create policy "trainer_clients_trainer_read" on public.trainer_clients
  for select to authenticated
  using (auth.uid() = trainer_id);

-- Status and contact_phone edits (app/clients.tsx). The trigger below stops
-- the ids themselves from changing.
drop policy if exists "trainer_clients_trainer_update" on public.trainer_clients;
create policy "trainer_clients_trainer_update" on public.trainer_clients
  for update to authenticated
  using (auth.uid() = trainer_id)
  with check (auth.uid() = trainer_id);

drop policy if exists "trainer_clients_trainer_delete" on public.trainer_clients;
create policy "trainer_clients_trainer_delete" on public.trainer_clients
  for delete to authenticated
  using (auth.uid() = trainer_id);

-- Applies to end-user connections only (auth.uid() is not null), like 0013:
-- the SQL Editor and service_role stay able to correct data.
create or replace function public.prevent_trainer_client_relink()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.uid() is not null
     and (new.trainer_id is distinct from old.trainer_id or new.client_id is distinct from old.client_id) then
    raise exception 'trainer_id and client_id cannot be changed';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_trainer_client_relink on public.trainer_clients;
create trigger trg_prevent_trainer_client_relink
  before update on public.trainer_clients
  for each row execute function public.prevent_trainer_client_relink();

-- ---------------------------------------------------------------------------
-- 3) add_client_by_email: callable by nobody (kept for history)
-- ---------------------------------------------------------------------------
revoke execute on function public.add_client_by_email(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4) scheduled_workouts: only for your own clients
-- ---------------------------------------------------------------------------
drop policy if exists "scheduled_workouts_trainer_all" on public.scheduled_workouts;
create policy "scheduled_workouts_trainer_all" on public.scheduled_workouts
  for all to authenticated
  using (auth.uid() = trainer_id)
  with check (
    auth.uid() = trainer_id
    and (
      (client_id is not null and exists (
        select 1 from public.trainer_clients tc
        where tc.trainer_id = auth.uid() and tc.client_id = scheduled_workouts.client_id
      ))
      or
      (managed_client_id is not null and exists (
        select 1 from public.managed_clients mc
        where mc.id = scheduled_workouts.managed_client_id and mc.trainer_id = auth.uid()
      ))
    )
  );
