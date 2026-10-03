-- 0025_profile_business_defaults.sql — redesign handoff B3: the trainer's
-- business name and default price per session.
--
-- Used by the redesign's trainer settings (D29c): the default price
-- pre-fills the add-client sheet (D25), and the business name is what
-- clients see as "trained by" via my_trainer() (0026) and on the share card.
--
-- Both nullable: older app builds never send them, and "not set" is a real
-- state — a client with no price is already surfaced as "no price set" by
-- the money views rather than counted as 0.
--
-- No policy change: the trainer writes them through profiles_update_own
-- (0001), which is row-level with no column list, and 0013's guard trigger
-- only blocks role changes and clearing consent stamps (verified in the dry
-- run). Clients can also write their own row's columns — harmless, since
-- nothing reads a client's business_name.
--
-- Re-runnable.

alter table public.profiles add column if not exists default_price_per_session numeric;
alter table public.profiles add column if not exists business_name text;

alter table public.profiles drop constraint if exists profiles_default_price_nonneg;
alter table public.profiles add constraint profiles_default_price_nonneg
  check (default_price_per_session is null or default_price_per_session >= 0);

alter table public.profiles drop constraint if exists profiles_business_name_len;
alter table public.profiles add constraint profiles_business_name_len
  check (business_name is null or char_length(business_name) <= 60);
