-- supabase/seed.sql — demo data for fast, repeatable smoke tests.
--
-- WHAT THIS CREATES: one demo trainer, two demo clients (linked to the trainer),
-- three exercises, and one workout template wiring those exercises together.
--
-- WHEN IT RUNS:
--   * Local dev:  `npm run db:seed` (= `supabase db reset`) re-applies every
--     migration and then runs this file automatically. Run it AFTER `supabase init`
--     + `supabase start`.
--   * Hosted project: paste this file into the Supabase Dashboard -> SQL Editor
--     and run it (or pipe it through psql with your DB connection string).
--
-- DEPENDENCY: the tables below are created by the migrations in
-- supabase/migrations/ — profiles (V1), exercises (V2), workout_templates +
-- template_exercises (V3), trainer_clients (V4). So this seed becomes fully
-- runnable as those versions land. It is safe to re-run: every statement uses a
-- fixed UUID + ON CONFLICT DO NOTHING, so it never duplicates rows.
--
-- AUTH NOTE: profiles.id references auth.users(id). For LOCAL dev we insert the
-- matching auth.users rows here. Real sign-up happens via phone/email OTP (V1);
-- these demo rows just let you smoke-test without signing in each time.

-- ---------------------------------------------------------------------------
-- 1) Auth users (LOCAL DEV ONLY). Fixed UUIDs so everything below can link to
--    them deterministically. Emails are demo addresses.
-- ---------------------------------------------------------------------------
insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous)
values
  ('a0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'trainer@coachflow.demo', now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"display_name":"Demo Trainer"}', false, false),
  ('a0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'client1@coachflow.demo', now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"display_name":"Demo Client One"}', false, false),
  ('a0000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'client2@coachflow.demo', now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"display_name":"Demo Client Two"}', false, false)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 2) Profiles. role is 'trainer' or 'client'; locale defaults to Hebrew ('he').
--    Consent timestamps are set so these demo users look fully onboarded.
-- ---------------------------------------------------------------------------
insert into public.profiles (id, role, display_name, locale, accepted_terms_at, accepted_health_disclaimer_at)
values
  ('a0000000-0000-0000-0000-000000000001', 'trainer', 'Demo Trainer',    'he', now(), now()),
  ('a0000000-0000-0000-0000-000000000002', 'client',  'Demo Client One', 'he', now(), now()),
  ('a0000000-0000-0000-0000-000000000003', 'client',  'Demo Client Two', 'he', now(), now())
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 3) Roster: link both clients to the trainer (status 'active').
-- ---------------------------------------------------------------------------
insert into public.trainer_clients (id, trainer_id, client_id, status)
values
  ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 'active'),
  ('b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000003', 'active')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 4) Exercises owned by the trainer (with placeholder YouTube demo links).
-- ---------------------------------------------------------------------------
insert into public.exercises (id, trainer_id, name, description, muscle_group, video_url, default_sets, default_reps)
values
  ('e0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Back Squat',  'Barbell back squat, full depth.',        'legs',  'https://www.youtube.com/watch?v=ultWZbUMPL8', 4, 8),
  ('e0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'Bench Press', 'Flat barbell bench press.',              'chest', 'https://www.youtube.com/watch?v=rT7DgCr-3pg', 4, 8),
  ('e0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'Deadlift',    'Conventional deadlift from the floor.',  'back',  'https://www.youtube.com/watch?v=op9kVnSso6Q', 3, 5)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 5) One template ("Full Body A") owned by the trainer.
-- ---------------------------------------------------------------------------
insert into public.workout_templates (id, trainer_id, name, description, notes)
values
  ('c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Full Body A', 'Beginner full-body session.', 'Focus on form over weight.')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 6) Template exercises: order the three lifts with per-exercise targets.
--    position drives display order; rest_seconds powers the V5 rest timer.
-- ---------------------------------------------------------------------------
insert into public.template_exercises (id, template_id, exercise_id, position, target_sets, target_reps, target_weight, rest_seconds)
values
  ('d0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', 1, 4, 8, 60, 120),
  ('d0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000002', 2, 4, 8, 40, 120),
  ('d0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000003', 3, 3, 5, 80, 150)
on conflict (id) do nothing;
