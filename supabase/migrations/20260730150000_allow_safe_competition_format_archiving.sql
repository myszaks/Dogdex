-- Published competition format definitions remain immutable, but their lifecycle
-- status may change from published to archived when the API confirms that no
-- event references the version.

create or replace function public.prevent_published_competition_format_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'published'
    and new.status not in ('published', 'archived')
  then
    raise exception 'Published competition format versions may only be archived';
  end if;

  if old.status = 'archived'
    and new.status is distinct from old.status
  then
    raise exception 'Archived competition format versions cannot be restored or edited';
  end if;

  if old.status = 'published'
    and new.status = 'archived'
    and exists (
      select 1
      from public.events
      where competition_format_id = old.id
    )
  then
    raise exception 'Competition format versions used by events cannot be archived';
  end if;

  if old.status in ('published', 'archived')
    and (
      new.definition is distinct from old.definition
      or new.name is distinct from old.name
      or new.description is distinct from old.description
      or new.family_id is distinct from old.family_id
      or new.version is distinct from old.version
      or new.previous_version_id is distinct from old.previous_version_id
      or new.created_by is distinct from old.created_by
      or new.is_system is distinct from old.is_system
      or new.published_at is distinct from old.published_at
      or new.created_at is distinct from old.created_at
    )
  then
    raise exception 'Published competition format versions are immutable';
  end if;

  return new;
end;
$$;

drop policy if exists "competition_formats_owner_update_draft"
  on public.competition_formats;
drop policy if exists "competition_formats_owner_update"
  on public.competition_formats;

create policy "competition_formats_owner_update"
  on public.competition_formats for update
  using (
    (created_by = auth.uid() and is_system = false)
    or public.user_role() = 'admin'
  )
  with check (
    (created_by = auth.uid() and is_system = false)
    or public.user_role() = 'admin'
  );

revoke all on function public.prevent_published_competition_format_change() from public;
