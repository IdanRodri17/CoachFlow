-- 0012_intake.sql — V12b: client intake questionnaire (leaderboard deferred).
--
-- One nullable jsonb on profiles; null means "hasn't filled the intake yet"
-- (the app shows the form once, then stores at least {}). Shape, all keys
-- optional: { goals: text, injuries: text, equipment: text,
--             experience: 'beginner' | 'intermediate' | 'advanced' }.
-- experience is stored as the raw key so the UI can translate it per locale.
--
-- Nullable on purpose so older app builds keep working. No RLS changes:
-- clients already update their own profiles row (onboarding), and trainers
-- already select their clients' profiles rows (dashboard name lookup) —
-- RLS is row-level, so the new column rides along.

alter table public.profiles
  add column if not exists intake jsonb;
