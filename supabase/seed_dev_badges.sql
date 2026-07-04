-- seed_dev_badges.sql — DEV helper. Run in the Supabase SQL Editor to set up a
-- clean, deterministic scenario for testing all three V9 badges at once.
--
-- WHY A SEPARATE FILE: first_workout / first_month read from workout_logs;
-- streak_10 reads from scheduled_workouts (via the V8 client_streaks view).
-- Backdating only scheduled_workouts (as an earlier ad-hoc SQL snippet did)
-- leaves workout_logs untouched, so first_workout/first_month don't line up
-- with what you'd expect from the scheduled_workouts history alone.
--
-- WHAT THIS DOES (dev client only — @coachflow.dev fixed accounts):
--   1. Clears the dev client's earned badges + their ENTIRE scheduled_workouts
--      history up to and including today (cascades to workout_logs / set_logs
--      / exercise_adjustments) — a clean slate so the count below is exact,
--      with no leftovers from earlier ad-hoc testing.
--   2. Creates 9 fully-consistent completed days (today-9 .. today-1): a
--      scheduled_workout AND a matching workout_log for each.
--   3. Pushes the oldest log 31 days back, so first_month (>= 30 days since
--      the very first completion) qualifies too.
--   4. Leaves today with a fresh, un-completed workout ready to log.
--
-- After running this: sign in as the dev client and complete TODAY's workout
-- through the normal app flow. That one completion runs checkAndAwardBadges
-- once and should award all three badges together: first_workout, streak_10,
-- first_month.
--
-- DESTRUCTIVE to the dev client's workout history — dev-only, safe to re-run,
-- never point this at a real trainer/client's data.

do $$
declare
  v_trainer  uuid;
  v_client   uuid;
  v_template uuid;
  v_today    date := (now() at time zone 'Asia/Jerusalem')::date;
  v_sw_id    uuid;
  i          int;
begin
  select id into v_trainer from auth.users where lower(email) = 'trainer@coachflow.dev';
  select id into v_client  from auth.users where lower(email) = 'client@coachflow.dev';

  if v_trainer is null or v_client is null then
    raise exception
      'Dev accounts not found. In the app, tap the dev Trainer button once and the dev Client button once, then re-run this.';
  end if;

  select id into v_template from public.workout_templates where trainer_id = v_trainer limit 1;

  -- 1) Clean slate.
  delete from public.badges where client_id = v_client;
  delete from public.scheduled_workouts where client_id = v_client and scheduled_date <= v_today;

  -- 2) 9 consistent completed days: scheduled_workout + matching workout_log.
  for i in 1..9 loop
    insert into public.scheduled_workouts (trainer_id, client_id, template_id, scheduled_date, status)
    values (v_trainer, v_client, v_template, v_today - i, 'completed')
    returning id into v_sw_id;

    insert into public.workout_logs (scheduled_workout_id, client_id, completed_at)
    values (v_sw_id, v_client, (v_today - i) + time '18:00');
  end loop;

  -- 3) Backdate the oldest log so first_month qualifies too.
  update public.workout_logs
  set completed_at = now() - interval '31 days'
  where id = (
    select id from public.workout_logs where client_id = v_client
    order by completed_at asc limit 1
  );

  -- 4) Today: fresh, un-completed — the one you'll finish through the app.
  insert into public.scheduled_workouts (trainer_id, client_id, template_id, scheduled_date, status, notes)
  values (v_trainer, v_client, v_template, v_today, 'scheduled', 'Badge smoke test — complete me!');
end $$;
