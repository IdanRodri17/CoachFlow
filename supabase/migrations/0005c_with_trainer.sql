-- 0005c_with_trainer.sql — mark a scheduled workout as a TRAINER session vs SOLO.
--
-- with_trainer = true (default): a fixed session WITH the trainer. The client may
-- not reschedule it (only the trainer can), and it's highlighted in the client's
-- list. with_trainer = false: a SOLO workout the client can shift a day at a time.
--
-- Enforced in the app (UI hides the shift arrows) AND here by a trigger, so a
-- client can't move a trainer session even via a direct API call.
--
-- Re-runnable.

alter table public.scheduled_workouts
  add column if not exists with_trainer boolean not null default true;

create or replace function public.prevent_client_reschedule()
returns trigger
language plpgsql
as $$
begin
  -- A client may not move a trainer-led workout to a different date...
  if old.with_trainer
     and new.scheduled_date is distinct from old.scheduled_date
     and auth.uid() = old.client_id then
    raise exception 'Trainer-led workouts can only be rescheduled by the trainer.';
  end if;
  -- ...nor flip the trainer-led flag themselves (only the trainer decides that).
  if auth.uid() = old.client_id
     and new.with_trainer is distinct from old.with_trainer then
    raise exception 'Only the trainer can change whether a workout is trainer-led.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_client_reschedule on public.scheduled_workouts;
create trigger trg_prevent_client_reschedule
  before update on public.scheduled_workouts
  for each row execute function public.prevent_client_reschedule();
