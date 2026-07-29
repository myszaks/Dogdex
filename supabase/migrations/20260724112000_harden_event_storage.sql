-- Store event media below the uploader's user-id folder so one organizer
-- cannot overwrite or delete another organizer's files.

drop policy if exists "event_thumbnails_auth_insert" on storage.objects;
drop policy if exists "event_thumbnails_auth_delete" on storage.objects;

create policy "event_thumbnails_owner_insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'event-thumbnails'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.user_role() = 'admin'
    )
  );

create policy "event_thumbnails_owner_delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'event-thumbnails'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.user_role() = 'admin'
    )
  );
