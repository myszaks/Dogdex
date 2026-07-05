create table if not exists public.role_upgrade_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  requested_role text not null check (requested_role in ('organizer', 'trainer', 'organizer_trainer')),
  status text not null default 'pending' check (status in ('pending', 'needs_info', 'approved', 'rejected')),
  full_name text not null,
  business_name text,
  city text,
  phone text,
  experience text not null,
  verification_links jsonb not null default '[]'::jsonb check (jsonb_typeof(verification_links) = 'array'),
  certification_urls jsonb not null default '[]'::jsonb check (jsonb_typeof(certification_urls) = 'array'),
  pricing_acknowledged boolean not null default false,
  terms_accepted boolean not null default false,
  admin_notes text,
  rejection_reason text,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_role_upgrade_requests_user_id on public.role_upgrade_requests(user_id);
create index if not exists idx_role_upgrade_requests_status on public.role_upgrade_requests(status);
create index if not exists idx_role_upgrade_requests_created_at on public.role_upgrade_requests(created_at desc);

drop trigger if exists role_upgrade_requests_updated_at on public.role_upgrade_requests;
create trigger role_upgrade_requests_updated_at
  before update on public.role_upgrade_requests
  for each row execute function public.update_updated_at_column();

alter table public.role_upgrade_requests enable row level security;

drop policy if exists "role_upgrade_requests_select_own_or_admin" on public.role_upgrade_requests;
create policy "role_upgrade_requests_select_own_or_admin"
  on public.role_upgrade_requests for select
  using (auth.uid() = user_id or public.user_role() = 'admin');

drop policy if exists "role_upgrade_requests_insert_own" on public.role_upgrade_requests;
create policy "role_upgrade_requests_insert_own"
  on public.role_upgrade_requests for insert
  with check (
    auth.uid() = user_id
    and status = 'pending'
    and pricing_acknowledged = true
    and terms_accepted = true
  );

drop policy if exists "role_upgrade_requests_update_own_active" on public.role_upgrade_requests;
create policy "role_upgrade_requests_update_own_active"
  on public.role_upgrade_requests for update
  using (auth.uid() = user_id and status in ('pending', 'needs_info'))
  with check (
    auth.uid() = user_id
    and status = 'pending'
    and pricing_acknowledged = true
    and terms_accepted = true
  );

drop policy if exists "role_upgrade_requests_admin_update" on public.role_upgrade_requests;
create policy "role_upgrade_requests_admin_update"
  on public.role_upgrade_requests for update
  using (public.user_role() = 'admin')
  with check (public.user_role() = 'admin');

grant all on public.role_upgrade_requests to service_role;
grant select, insert on public.role_upgrade_requests to authenticated;

drop policy if exists "events_organizer_insert" on public.events;
create policy "events_organizer_insert" on public.events
  for insert with check (public.user_role() in ('organizer', 'organizer_trainer', 'admin'));

drop policy if exists "events_organizer_update" on public.events;
create policy "events_organizer_update" on public.events
  for update using (public.user_role() in ('organizer', 'organizer_trainer', 'admin'));

drop policy if exists "events_organizer_delete" on public.events;
create policy "events_organizer_delete" on public.events
  for delete using (public.user_role() in ('organizer', 'organizer_trainer', 'admin'));

drop policy if exists "heats_organizer_insert" on public.heats;
create policy "heats_organizer_insert" on public.heats
  for insert with check (public.user_role() in ('organizer', 'organizer_trainer', 'admin'));

drop policy if exists "heats_organizer_update" on public.heats;
create policy "heats_organizer_update" on public.heats
  for update using (public.user_role() in ('organizer', 'organizer_trainer', 'admin'));

drop policy if exists "heats_organizer_delete" on public.heats;
create policy "heats_organizer_delete" on public.heats
  for delete using (public.user_role() in ('organizer', 'organizer_trainer', 'admin'));

drop policy if exists "results_organizer_insert" on public.results;
create policy "results_organizer_insert" on public.results
  for insert with check (public.user_role() in ('organizer', 'organizer_trainer', 'admin'));

drop policy if exists "results_organizer_update" on public.results;
create policy "results_organizer_update" on public.results
  for update using (public.user_role() in ('organizer', 'organizer_trainer', 'admin'));

drop policy if exists "results_organizer_delete" on public.results;
create policy "results_organizer_delete" on public.results
  for delete using (public.user_role() in ('organizer', 'organizer_trainer', 'admin'));

drop policy if exists "registrations_organizer_update" on public.registrations;
create policy "registrations_organizer_update" on public.registrations
  for update using (public.user_role() in ('organizer', 'organizer_trainer', 'admin'));

drop policy if exists "registrations_organizer_delete" on public.registrations;
create policy "registrations_organizer_delete" on public.registrations
  for delete using (public.user_role() in ('organizer', 'organizer_trainer', 'admin'));

drop policy if exists "participants_organizer_update" on public.participants;
create policy "participants_organizer_update" on public.participants
  for update using (public.user_role() in ('organizer', 'organizer_trainer', 'admin'));

drop policy if exists "participants_organizer_delete" on public.participants;
create policy "participants_organizer_delete" on public.participants
  for delete using (public.user_role() in ('organizer', 'organizer_trainer', 'admin'));

drop policy if exists "time_slots_organizer_insert" on public.time_slots;
create policy "time_slots_organizer_insert" on public.time_slots
  for insert with check (public.user_role() in ('organizer', 'organizer_trainer', 'admin'));

drop policy if exists "time_slots_organizer_update" on public.time_slots;
create policy "time_slots_organizer_update" on public.time_slots
  for update using (public.user_role() in ('organizer', 'organizer_trainer', 'admin'));

drop policy if exists "time_slots_organizer_delete" on public.time_slots;
create policy "time_slots_organizer_delete" on public.time_slots
  for delete using (public.user_role() in ('organizer', 'organizer_trainer', 'admin'));

drop policy if exists "cancellation_requests_organizer_update" on public.cancellation_requests;
create policy "cancellation_requests_organizer_update"
  on public.cancellation_requests for update
  using (
    exists (
      select 1
      from public.events
      join public.profiles on profiles.id = auth.uid()
      where events.id = cancellation_requests.event_id
        and events.created_by = auth.uid()
        and profiles.role in ('organizer', 'organizer_trainer', 'admin')
    )
    or public.user_role() = 'admin'
  );

drop policy if exists "trainer_profiles_insert_own" on public.trainer_profiles;
create policy "trainer_profiles_insert_own" on public.trainer_profiles
  for insert with check (
    auth.uid() = trainer_id
    and public.user_role() in ('trainer', 'organizer_trainer', 'admin')
  );

drop policy if exists "trainer_profiles_update_own" on public.trainer_profiles;
create policy "trainer_profiles_update_own" on public.trainer_profiles
  for update using (
    auth.uid() = trainer_id
    and public.user_role() in ('trainer', 'organizer_trainer', 'admin')
  );

drop policy if exists "trainer_profiles_delete_own" on public.trainer_profiles;
create policy "trainer_profiles_delete_own" on public.trainer_profiles
  for delete using (
    auth.uid() = trainer_id
    and public.user_role() in ('trainer', 'organizer_trainer', 'admin')
  );

drop policy if exists "training_types_insert_own" on public.training_types;
create policy "training_types_insert_own" on public.training_types
  for insert with check (
    auth.uid() = trainer_id
    and public.user_role() in ('trainer', 'organizer_trainer', 'admin')
  );

drop policy if exists "training_types_update_own" on public.training_types;
create policy "training_types_update_own" on public.training_types
  for update using (
    auth.uid() = trainer_id
    and public.user_role() in ('trainer', 'organizer_trainer', 'admin')
  );

drop policy if exists "training_types_delete_own" on public.training_types;
create policy "training_types_delete_own" on public.training_types
  for delete using (
    auth.uid() = trainer_id
    and public.user_role() in ('trainer', 'organizer_trainer', 'admin')
  );

drop policy if exists "training_availability_insert_own" on public.training_availability;
create policy "training_availability_insert_own" on public.training_availability
  for insert with check (
    public.user_role() in ('trainer', 'organizer_trainer', 'admin')
    and auth.uid() = (select trainer_id from public.training_types where id = training_type_id)
  );

drop policy if exists "training_availability_update_own" on public.training_availability;
create policy "training_availability_update_own" on public.training_availability
  for update using (
    public.user_role() in ('trainer', 'organizer_trainer', 'admin')
    and auth.uid() = (select trainer_id from public.training_types where id = training_type_id)
  );

drop policy if exists "training_availability_delete_own" on public.training_availability;
create policy "training_availability_delete_own" on public.training_availability
  for delete using (
    public.user_role() in ('trainer', 'organizer_trainer', 'admin')
    and auth.uid() = (select trainer_id from public.training_types where id = training_type_id)
  );

drop policy if exists "trainer_date_availability_insert_own" on public.trainer_date_availability;
create policy "trainer_date_availability_insert_own" on public.trainer_date_availability
  for insert with check (
    auth.uid() = trainer_id
    and public.user_role() in ('trainer', 'organizer_trainer', 'admin')
  );

drop policy if exists "trainer_date_availability_update_own" on public.trainer_date_availability;
create policy "trainer_date_availability_update_own" on public.trainer_date_availability
  for update using (
    auth.uid() = trainer_id
    and public.user_role() in ('trainer', 'organizer_trainer', 'admin')
  );

drop policy if exists "trainer_date_availability_delete_own" on public.trainer_date_availability;
create policy "trainer_date_availability_delete_own" on public.trainer_date_availability
  for delete using (
    auth.uid() = trainer_id
    and public.user_role() in ('trainer', 'organizer_trainer', 'admin')
  );
