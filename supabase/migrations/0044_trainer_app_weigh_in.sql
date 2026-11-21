-- 0044_trainer_app_weigh_in.sql — a trainer records a weigh-in for an app client.
--
-- WHY (Idan, 2026-11-21): a client weighed at the gym had no way in; the
-- client card offered "add weight" only for offline clients (0032), and an app
-- client's progress_entries were theirs alone to write.
--
-- HOW: one INSERT-only policy. The trainer may add a row for an app client
-- linked to them (trainer_clients), with weight and measurements only:
--   * photo_url must be null — a client's body photos stay theirs (their
--     storage folder <client_id>/ is client-only, and this adds no storage
--     policy);
--   * no UPDATE or DELETE for the trainer: once written, the row is the
--     client's like any other (progress_entries_client_all), and the trainer
--     still only reads it (progress_entries_trainer_read).
-- Offline clients are unchanged (0032's progress_entries_trainer_managed_all).
--
-- Re-runnable.

drop policy if exists progress_entries_trainer_app_insert on public.progress_entries;
create policy progress_entries_trainer_app_insert on public.progress_entries
  for insert to authenticated
  with check (
    client_id is not null
    and managed_client_id is null
    and photo_url is null
    and exists (
      select 1
      from public.trainer_clients tc
      where tc.trainer_id = (select auth.uid())
        and tc.client_id = progress_entries.client_id
    )
  );
