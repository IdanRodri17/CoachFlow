-- 0001_profiles.sql — V1 Foundation: the `profiles` table.
--
-- One row per authenticated user (a trainer or a client). The row is created
-- during onboarding (after the user verifies their OTP and accepts the terms +
-- health disclaimer). Row-Level Security (RLS) guarantees a user can only ever
-- read or write THEIR OWN row — enforced by Postgres, not just the app.
--
-- Re-runnable: `create table if not exists` + `drop policy if exists` mean you
-- can paste this into the Supabase SQL Editor more than once without errors.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role text not null check (role in ('trainer', 'client')),
  display_name text not null,
  locale text not null default 'he',
  avatar_url text,
  accepted_terms_at timestamptz,
  accepted_health_disclaimer_at timestamptz,
  created_at timestamptz not null default now()
);

-- Turn on RLS. With RLS enabled and no matching policy, access is DENIED by
-- default — so the three policies below are what grant the narrow access we want.
alter table public.profiles enable row level security;

-- A user can read only their own profile row.
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

-- A user can create only their own profile row (during onboarding).
drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles for insert
  with check (auth.uid() = id);

-- A user can update only their own profile row.
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);
