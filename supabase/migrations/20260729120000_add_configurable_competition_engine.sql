-- Configurable competition formats are stored as immutable version rows.
-- Events keep their own definition snapshot so historical calculations remain
-- reproducible even when an organizer creates a newer version of a format.

create table public.competition_formats (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null default gen_random_uuid(),
  previous_version_id uuid references public.competition_formats(id) on delete set null,
  version integer not null default 1 check (version > 0),
  name text not null check (char_length(name) between 1 and 120),
  description text,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  definition jsonb not null check (jsonb_typeof(definition) = 'object'),
  created_by uuid references auth.users(id) on delete cascade,
  is_system boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (family_id, version)
);

create unique index competition_formats_one_draft_per_family
  on public.competition_formats(family_id)
  where status = 'draft';
create index competition_formats_created_by_idx
  on public.competition_formats(created_by, updated_at desc);
create index competition_formats_public_idx
  on public.competition_formats(status, is_system)
  where status = 'published';

create or replace function public.prevent_published_competition_format_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
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
    )
  then
    raise exception 'Published competition format versions are immutable';
  end if;
  return new;
end;
$$;

create trigger prevent_published_competition_format_change
  before update on public.competition_formats
  for each row execute function public.prevent_published_competition_format_change();

alter table public.events
  add column competition_format_id uuid references public.competition_formats(id) on delete set null,
  add column competition_config jsonb check (
    competition_config is null or jsonb_typeof(competition_config) = 'object'
  ),
  add column competition_values jsonb not null default '{}'::jsonb check (
    jsonb_typeof(competition_values) = 'object'
  ),
  add column competition_config_revision integer not null default 1 check (
    competition_config_revision > 0
  ),
  add column competition_config_locked_at timestamptz;

create index events_competition_format_id_idx
  on public.events(competition_format_id)
  where competition_format_id is not null;

create table public.competition_result_entries (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  participant_id uuid not null references public.participants(id) on delete cascade,
  stage_id text not null,
  attempt_id text not null,
  status text,
  values jsonb not null default '{}'::jsonb check (jsonb_typeof(values) = 'object'),
  revision integer not null default 1 check (revision > 0),
  recorded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, participant_id, stage_id, attempt_id)
);

create index competition_result_entries_event_idx
  on public.competition_result_entries(event_id, stage_id, attempt_id);
create index competition_result_entries_participant_idx
  on public.competition_result_entries(participant_id);

create table public.competition_calculated_results (
  event_id uuid not null references public.events(id) on delete cascade,
  participant_id uuid not null references public.participants(id) on delete cascade,
  computed jsonb not null default '{}'::jsonb check (jsonb_typeof(computed) = 'object'),
  groups jsonb not null default '{}'::jsonb check (jsonb_typeof(groups) = 'object'),
  ranks jsonb not null default '{}'::jsonb check (jsonb_typeof(ranks) = 'object'),
  source_revision integer not null default 1 check (source_revision > 0),
  engine_version integer not null default 1 check (engine_version > 0),
  recalculated_at timestamptz not null default now(),
  primary key (event_id, participant_id)
);

create index competition_calculated_results_event_idx
  on public.competition_calculated_results(event_id);

create table public.competition_live_state (
  event_id uuid primary key references public.events(id) on delete cascade,
  view_id text,
  phase text,
  current_stage_id text,
  current_attempt_id text,
  current_participant_id uuid references public.participants(id) on delete set null,
  cursor integer not null default 0 check (cursor >= 0),
  state jsonb not null default '{}'::jsonb check (jsonb_typeof(state) = 'object'),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create or replace function public.lock_event_competition_config()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.events
  set competition_config_locked_at = coalesce(competition_config_locked_at, now())
  where id = new.event_id;
  return new;
end;
$$;

create trigger lock_event_competition_config_on_first_entry
  before insert on public.competition_result_entries
  for each row execute function public.lock_event_competition_config();

create or replace function public.prevent_locked_competition_config_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.competition_config_locked_at is not null
    and (
      new.competition_config is distinct from old.competition_config
      or new.competition_format_id is distinct from old.competition_format_id
      or new.competition_values is distinct from old.competition_values
    )
  then
    raise exception 'Competition configuration is locked after the first result entry';
  end if;
  return new;
end;
$$;

create trigger prevent_locked_event_competition_config_change
  before update on public.events
  for each row execute function public.prevent_locked_competition_config_change();

revoke all on function public.prevent_published_competition_format_change() from public;
revoke all on function public.lock_event_competition_config() from public;
revoke all on function public.prevent_locked_competition_config_change() from public;

alter table public.competition_formats enable row level security;
alter table public.competition_result_entries enable row level security;
alter table public.competition_calculated_results enable row level security;
alter table public.competition_live_state enable row level security;

create policy "competition_formats_visible"
  on public.competition_formats for select
  using (
    created_by = auth.uid()
    or (is_system = true and status = 'published')
    or public.user_role() = 'admin'
  );

create policy "competition_formats_owner_insert"
  on public.competition_formats for insert
  with check (
    public.user_role() in ('organizer', 'organizer_trainer', 'admin')
    and (
      (created_by = auth.uid() and is_system = false)
      or public.user_role() = 'admin'
    )
  );

create policy "competition_formats_owner_update_draft"
  on public.competition_formats for update
  using (
    (created_by = auth.uid() and status = 'draft' and is_system = false)
    or public.user_role() = 'admin'
  )
  with check (
    (created_by = auth.uid() and is_system = false)
    or public.user_role() = 'admin'
  );

create policy "competition_formats_owner_delete_draft"
  on public.competition_formats for delete
  using (
    (created_by = auth.uid() and status = 'draft' and is_system = false)
    or public.user_role() = 'admin'
  );

create policy "competition_entries_public_or_manager_read"
  on public.competition_result_entries for select
  using (
    public.are_event_results_public(event_id)
    or public.is_event_manager(event_id)
  );

create policy "competition_entries_manager_insert"
  on public.competition_result_entries for insert
  with check (
    public.is_event_manager(event_id)
    and recorded_by = auth.uid()
  );

create policy "competition_entries_manager_update"
  on public.competition_result_entries for update
  using (public.is_event_manager(event_id))
  with check (
    public.is_event_manager(event_id)
    and recorded_by = auth.uid()
  );

create policy "competition_entries_manager_delete"
  on public.competition_result_entries for delete
  using (public.is_event_manager(event_id));

create policy "competition_calculated_public_or_manager_read"
  on public.competition_calculated_results for select
  using (
    public.are_event_results_public(event_id)
    or public.is_event_manager(event_id)
  );

create policy "competition_calculated_manager_insert"
  on public.competition_calculated_results for insert
  with check (public.is_event_manager(event_id));

create policy "competition_calculated_manager_update"
  on public.competition_calculated_results for update
  using (public.is_event_manager(event_id))
  with check (public.is_event_manager(event_id));

create policy "competition_calculated_manager_delete"
  on public.competition_calculated_results for delete
  using (public.is_event_manager(event_id));

create policy "competition_live_public_or_manager_read"
  on public.competition_live_state for select
  using (
    public.are_event_results_public(event_id)
    or public.is_event_manager(event_id)
  );

create policy "competition_live_manager_insert"
  on public.competition_live_state for insert
  with check (
    public.is_event_manager(event_id)
    and updated_by = auth.uid()
  );

create policy "competition_live_manager_update"
  on public.competition_live_state for update
  using (public.is_event_manager(event_id))
  with check (
    public.is_event_manager(event_id)
    and updated_by = auth.uid()
  );

create policy "competition_live_manager_delete"
  on public.competition_live_state for delete
  using (public.is_event_manager(event_id));

revoke all on table public.competition_formats from anon;
revoke all on table public.competition_result_entries from anon;
revoke all on table public.competition_calculated_results from anon;
revoke all on table public.competition_live_state from anon;

grant select on table public.competition_formats to anon;
grant select on table public.competition_result_entries to anon;
grant select on table public.competition_calculated_results to anon;
grant select on table public.competition_live_state to anon;

grant select, insert, update, delete on table public.competition_formats to authenticated;
grant select, insert, update, delete on table public.competition_result_entries to authenticated;
grant select, insert, update, delete on table public.competition_calculated_results to authenticated;
grant select, insert, update, delete on table public.competition_live_state to authenticated;

grant all on table public.competition_formats to service_role;
grant all on table public.competition_result_entries to service_role;
grant all on table public.competition_calculated_results to service_role;
grant all on table public.competition_live_state to service_role;

alter publication supabase_realtime add table public.competition_calculated_results;
alter publication supabase_realtime add table public.competition_live_state;
