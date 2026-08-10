-- Reusable organizer team directory. Event access remains scoped through
-- event_team_members so every event can override the default permissions.

create table if not exists public.organizer_team_members (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  user_id uuid references auth.users(id) on delete set null,
  default_permissions text[] not null,
  auto_assign_new_events boolean not null default true,
  status text not null default 'pending' check (status in ('pending', 'active')),
  invited_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organizer_team_members_email_normalized check (email = lower(trim(email))),
  constraint organizer_team_members_permissions_valid check (
    cardinality(default_permissions) > 0
    and default_permissions <@ array['registrations', 'checkin', 'results', 'finance']::text[]
  ),
  unique (organizer_id, email)
);

create index if not exists idx_organizer_team_members_user
  on public.organizer_team_members(user_id, organizer_id);
create index if not exists idx_organizer_team_members_auto_assign
  on public.organizer_team_members(organizer_id, auto_assign_new_events)
  where auto_assign_new_events;

drop trigger if exists organizer_team_members_updated_at on public.organizer_team_members;
create trigger organizer_team_members_updated_at
  before update on public.organizer_team_members
  for each row execute function public.update_updated_at_column();

alter table public.organizer_team_members enable row level security;

drop policy if exists "organizer_team_members_owner_or_self_read" on public.organizer_team_members;
create policy "organizer_team_members_owner_or_self_read"
  on public.organizer_team_members for select to authenticated
  using (
    organizer_id = auth.uid()
    or user_id = auth.uid()
    or lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    or public.user_role() = 'admin'
  );

grant select on public.organizer_team_members to authenticated;
grant all on public.organizer_team_members to service_role;

alter table public.event_team_members
  add column if not exists organizer_team_member_id uuid
  references public.organizer_team_members(id) on delete set null;

create index if not exists idx_event_team_members_organizer_member
  on public.event_team_members(organizer_team_member_id, event_id);

create or replace function public.assign_organizer_team_to_new_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.event_team_members (
    event_id,
    email,
    user_id,
    permissions,
    status,
    invited_by,
    organizer_team_member_id
  )
  select
    new.id,
    member.email,
    member.user_id,
    member.default_permissions,
    case when member.user_id is null then 'pending' else 'active' end,
    new.created_by,
    member.id
  from public.organizer_team_members member
  where member.organizer_id = new.created_by
    and member.auto_assign_new_events
    and member.status in ('pending', 'active')
  on conflict (event_id, email) do nothing;

  return new;
end;
$$;

revoke all on function public.assign_organizer_team_to_new_event() from public;

drop trigger if exists events_assign_organizer_team on public.events;
create trigger events_assign_organizer_team
  after insert on public.events
  for each row execute function public.assign_organizer_team_to_new_event();
