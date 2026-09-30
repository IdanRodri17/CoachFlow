-- 0021_invite_label.sql — V18b follow-up: say who an invite is for.
--
-- Invites go out through WhatsApp's chat picker, so the app never knew who a
-- pending code was meant for — "waiting to join" listed bare codes. An
-- optional, trainer-typed label ("Dana") fixes that. Display only: it grants
-- nothing and is never matched against anything.
--
-- create_invite() gains an optional p_label. The zero-argument version is
-- dropped first — PostgREST can't choose between f() and f(p_label default
-- null) for a call with no arguments.
--
-- Re-runnable.

alter table public.client_invites
  add column if not exists label text;

alter table public.client_invites drop constraint if exists client_invites_label_len;
alter table public.client_invites add constraint client_invites_label_len
  check (label is null or char_length(label) <= 60);

drop function if exists public.create_invite();

create or replace function public.create_invite(p_label text default null)
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
      insert into public.client_invites (trainer_id, code, label)
      values (auth.uid(), v_code, nullif(trim(p_label), ''))
      returning * into v_invite;
      return v_invite;
    exception when unique_violation then
      -- Collision with an existing code: draw again.
    end;
  end loop;
end;
$$;

revoke all on function public.create_invite(text) from public, anon;
grant execute on function public.create_invite(text) to authenticated;
