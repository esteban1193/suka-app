-- Storage buckets for activity images/video. Safe to re-run.
-- Public buckets: read access doesn't require auth (simplest way to display images/video in
-- the app without signed URLs), but only signed-in users can upload/delete (see policies below).

insert into storage.buckets (id, name, public)
values ('activity-images', 'activity-images', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('activity-videos', 'activity-videos', true)
on conflict (id) do nothing;

-- Anyone can view files in these buckets (needed for <img>/<video> tags to load without auth).
drop policy if exists "public read activity-images" on storage.objects;
create policy "public read activity-images" on storage.objects
  for select to public using (bucket_id = 'activity-images');

drop policy if exists "public read activity-videos" on storage.objects;
create policy "public read activity-videos" on storage.objects
  for select to public using (bucket_id = 'activity-videos');

-- Only signed-in users can upload/replace/delete — matches the "everyone signed in has full
-- access" model used for the rest of the app.
drop policy if exists "authenticated write activity-images" on storage.objects;
create policy "authenticated write activity-images" on storage.objects
  for all to authenticated
  using (bucket_id = 'activity-images')
  with check (bucket_id = 'activity-images');

drop policy if exists "authenticated write activity-videos" on storage.objects;
create policy "authenticated write activity-videos" on storage.objects
  for all to authenticated
  using (bucket_id = 'activity-videos')
  with check (bucket_id = 'activity-videos');
