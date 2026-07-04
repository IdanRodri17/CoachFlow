-- 0007_progress.sql — V7: progress tracking (weight, measurements, photo).
--
-- progress_entries: a client's periodic weigh-in / measurements / progress photo.
-- Client-owned; the trainer can READ entries for clients on their roster.
--
-- Photos live in a PRIVATE Storage bucket 'progress-photos', keyed by the
-- client's id (path = "<client_id>/<file>"), so only that client (and their
-- trainer) can read them. RLS on storage.objects enforces this.
--
-- Re-runnable.

create table if not exists public.progress_entries (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles (id) on delete cascade,
  date date not null,
  weight numeric,
  measurements jsonb,
  photo_url text, -- storage path within the progress-photos bucket (not a public URL)
  created_at timestamptz not null default now()
);

create index if not exists progress_entries_client_date_idx
  on public.progress_entries (client_id, date);

alter table public.progress_entries enable row level security;

drop policy if exists "progress_entries_client_all" on public.progress_entries;
create policy "progress_entries_client_all" on public.progress_entries
  for all to authenticated
  using (auth.uid() = client_id)
  with check (auth.uid() = client_id);

drop policy if exists "progress_entries_trainer_read" on public.progress_entries;
create policy "progress_entries_trainer_read" on public.progress_entries
  for select to authenticated
  using (
    exists (
      select 1 from public.trainer_clients tc
      where tc.trainer_id = auth.uid() and tc.client_id = progress_entries.client_id
    )
  );

-- ---------------------------------------------------------------------------
-- Private Storage bucket for progress photos.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('progress-photos', 'progress-photos', false)
on conflict (id) do nothing;

-- A client may read/write only their own folder ("<client_id>/...").
drop policy if exists "progress_photos_client_all" on storage.objects;
create policy "progress_photos_client_all" on storage.objects
  for all to authenticated
  using (
    bucket_id = 'progress-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'progress-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- A trainer may read the photos of clients on their roster.
drop policy if exists "progress_photos_trainer_read" on storage.objects;
create policy "progress_photos_trainer_read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'progress-photos'
    and exists (
      select 1 from public.trainer_clients tc
      where tc.trainer_id = auth.uid()
        and tc.client_id::text = (storage.foldername(name))[1]
    )
  );
