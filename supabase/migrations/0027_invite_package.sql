-- 0027_invite_package.sql — redesign handoff B5: an invite can carry the
-- client's price and session package.
--
-- The redesign's add-client sheet (D25) asks for price per session and
-- package size up front, the same for app and offline clients. An offline
-- client's package is saved directly; an app client only exists once they
-- accept the invite — so the invite carries the numbers, and accept_invite()
-- creates the package at the moment of consent.
--
-- Rules:
--   * Both columns nullable — an invite without a package behaves exactly as
--     before (0020/0021).
--   * A price needs a package: price lives on packages.price_per_session, so
--     a price with no package would be silently dropped. The check constraint
--     makes that an explicit error instead.
--   * accept_invite() still links ONLY the caller, with the same single
--     generic error for wrong / used / expired codes. The package insert is
--     `on conflict do nothing`, so re-joining a trainer never overwrites an
--     existing package (or its used_sessions).
--
-- create_invite() gains two optional parameters. The one-parameter version
-- (0021) is dropped first — PostgREST can't choose between overloads that
-- differ only in defaulted arguments.
--
-- Re-runnable.

alter table public.client_invites
  add column if not exists price_per_session numeric,
  add column if not exists package_sessions int;

alter table public.client_invites drop constraint if exists client_invites_price_nonneg;
alter table public.client_invites add constraint client_invites_price_nonneg
  check (price_per_session is null or price_per_session >= 0);

alter table public.client_invites drop constraint if exists client_invites_package_positive;
alter table public.client_invites add constraint client_invites_package_positive
  check (package_sessions is null or package_sessions > 0);

alter table public.client_invites drop constraint if exists client_invites_price_needs_package;
alter table public.client_invites add constraint client_invites_price_needs_package
  check (price_per_session is null or package_sessions is not null);

drop function if exists public.create_invite(text);

create or replace function public.create_invite(
  p_label text default null,
  p_price_per_session numeric default null,
  p_package_sessions int default null
)
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
    v_bytes := uuid_send(gen_random_uuid());
    v_code := '';
    for i in 0..5 loop
      v_code := v_code || substr(v_alphabet, 1 + get_byte(v_bytes, i) % length(v_alphabet), 1);
    end loop;

    begin
      insert into public.client_invites (trainer_id, code, label, price_per_session, package_sessions)
      values (auth.uid(), v_code, nullif(trim(p_label), ''), p_price_per_session, p_package_sessions)
      returning * into v_invite;
      return v_invite;
    exception when unique_violation then
      -- Collision with an existing code: draw again.
    end;
  end loop;
end;
$$;

revoke all on function public.create_invite(text, numeric, int) from public, anon;
grant execute on function public.create_invite(text, numeric, int) to authenticated;

-- Same as 0020, plus the package insert after linking.
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

  -- B5: the package the trainer set on the invite, created at consent time.
  -- Never overwrites an existing package (re-join keeps used_sessions).
  if v_invite.package_sessions is not null then
    insert into public.packages (trainer_id, client_id, total_sessions, price_per_session)
    values (v_invite.trainer_id, auth.uid(), v_invite.package_sessions, v_invite.price_per_session)
    on conflict (trainer_id, client_id) where client_id is not null do nothing;
  end if;

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

revoke all on function public.accept_invite(text) from public, anon;
grant execute on function public.accept_invite(text) to authenticated;
