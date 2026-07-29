insert into storage.buckets (id, name, public)
values ('trainers', 'trainers', true)
on conflict (id) do update set public = true;

drop policy if exists "trainer_photos_public_read" on storage.objects;
create policy "trainer_photos_public_read"
  on storage.objects for select
  using (bucket_id = 'trainers');

drop policy if exists "trainer_photos_insert_own_folder" on storage.objects;
create policy "trainer_photos_insert_own_folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'trainers'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.user_role() in ('trainer', 'organizer_trainer', 'admin')
  );

drop policy if exists "trainer_photos_delete_own_folder" on storage.objects;
create policy "trainer_photos_delete_own_folder"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'trainers'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.user_role() in ('trainer', 'organizer_trainer', 'admin')
  );
