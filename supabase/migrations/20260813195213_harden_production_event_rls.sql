-- Align production event-data access with the least-privilege model already
-- used by DEV. Public live/schedule pages must use their server-side,
-- disclosure-aware queries instead of reading participant PII with the anon key.

create schema if not exists private;
revoke all on schema private from public;

create index if not exists events_created_by_idx
  on public.events(created_by);
create index if not exists registrations_event_participant_idx
  on public.registrations(event_id, participant_id);

create or replace function public.is_event_manager(target_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    public.user_role() = 'admin'
    or exists (
      select 1
      from public.events event
      where event.id = target_event_id
        and event.created_by = (select auth.uid())
    );
$$;

create or replace function public.is_public_event(target_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.events event
    where event.id = target_event_id
      and event.status <> 'draft'
  );
$$;

create or replace function public.are_event_results_public(target_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.events event
    where event.id = target_event_id
      and event.status <> 'draft'
      and event.results_public = true
  );
$$;

create or replace function public.is_participant_owner(target_participant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.participants participant
      where participant.id = target_participant_id
        and (
          participant.user_id = (select auth.uid())
          or (
            participant.owner_email is not null
            and lower(participant.owner_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
          )
        )
    );
$$;

create or replace function public.is_participant_manager(target_participant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    public.user_role() = 'admin'
    or exists (
      select 1
      from public.registrations registration
      join public.events event on event.id = registration.event_id
      where registration.participant_id = target_participant_id
        and event.created_by = (select auth.uid())
    );
$$;

revoke all on function public.is_event_manager(uuid) from public;
revoke all on function public.is_public_event(uuid) from public;
revoke all on function public.are_event_results_public(uuid) from public;
revoke all on function public.is_participant_owner(uuid) from public;
revoke all on function public.is_participant_manager(uuid) from public;

grant execute on function public.is_event_manager(uuid) to authenticated, service_role;
grant execute on function public.is_public_event(uuid) to anon, authenticated, service_role;
grant execute on function public.are_event_results_public(uuid) to anon, authenticated, service_role;
grant execute on function public.is_participant_owner(uuid) to authenticated, service_role;
grant execute on function public.is_participant_manager(uuid) to authenticated, service_role;

alter table public.events enable row level security;
drop policy if exists "events_public_read" on public.events;
drop policy if exists "events_organizer_insert" on public.events;
drop policy if exists "events_organizer_update" on public.events;
drop policy if exists "events_organizer_delete" on public.events;
drop policy if exists "events_public_or_owner_read" on public.events;
drop policy if exists "events_owner_insert" on public.events;
drop policy if exists "events_owner_update" on public.events;
drop policy if exists "events_owner_delete" on public.events;

create policy "events_public_or_owner_read" on public.events
  for select to anon, authenticated
  using (
    status <> 'draft'
    or created_by = (select auth.uid())
    or public.user_role() = 'admin'
  );

create policy "events_owner_insert" on public.events
  for insert to authenticated
  with check (
    public.user_role() in ('organizer', 'organizer_trainer', 'admin')
    and (created_by = (select auth.uid()) or public.user_role() = 'admin')
  );

create policy "events_owner_update" on public.events
  for update to authenticated
  using (created_by = (select auth.uid()) or public.user_role() = 'admin')
  with check (created_by = (select auth.uid()) or public.user_role() = 'admin');

create policy "events_owner_delete" on public.events
  for delete to authenticated
  using (created_by = (select auth.uid()) or public.user_role() = 'admin');

alter table public.participants enable row level security;
drop policy if exists "participants_public_read" on public.participants;
drop policy if exists "participants_public_insert" on public.participants;
drop policy if exists "participants_organizer_update" on public.participants;
drop policy if exists "participants_organizer_delete" on public.participants;
drop policy if exists "participants_owner_or_manager_read" on public.participants;
drop policy if exists "participants_admin_update" on public.participants;
drop policy if exists "participants_admin_delete" on public.participants;

create policy "participants_owner_or_manager_read" on public.participants
  for select to authenticated
  using (
    public.is_participant_owner(id)
    or public.is_participant_manager(id)
  );

create policy "participants_admin_update" on public.participants
  for update to authenticated
  using (public.user_role() = 'admin')
  with check (public.user_role() = 'admin');

create policy "participants_admin_delete" on public.participants
  for delete to authenticated
  using (public.user_role() = 'admin');

revoke all on table public.participants from anon;
revoke all on table public.participants from authenticated;
grant select, update, delete on table public.participants to authenticated;

alter table public.registrations enable row level security;
drop policy if exists "registrations_public_read" on public.registrations;
drop policy if exists "registrations_public_insert" on public.registrations;
drop policy if exists "registrations_organizer_update" on public.registrations;
drop policy if exists "registrations_organizer_delete" on public.registrations;
drop policy if exists "registrations_owner_or_manager_read" on public.registrations;
drop policy if exists "registrations_manager_update" on public.registrations;
drop policy if exists "registrations_manager_delete" on public.registrations;

create policy "registrations_owner_or_manager_read" on public.registrations
  for select to authenticated
  using (
    public.is_participant_owner(participant_id)
    or public.is_event_manager(event_id)
  );

create policy "registrations_manager_update" on public.registrations
  for update to authenticated
  using (public.is_event_manager(event_id))
  with check (public.is_event_manager(event_id));

create policy "registrations_manager_delete" on public.registrations
  for delete to authenticated
  using (public.is_event_manager(event_id));

revoke all on table public.registrations from anon;
revoke all on table public.registrations from authenticated;
grant select, update, delete on table public.registrations to authenticated;

alter table public.results enable row level security;
drop policy if exists "results_public_read" on public.results;
drop policy if exists "results_organizer_insert" on public.results;
drop policy if exists "results_organizer_update" on public.results;
drop policy if exists "results_organizer_delete" on public.results;
drop policy if exists "results_public_or_manager_read" on public.results;
drop policy if exists "results_manager_insert" on public.results;
drop policy if exists "results_manager_update" on public.results;
drop policy if exists "results_manager_delete" on public.results;

create policy "results_public_or_manager_read" on public.results
  for select to anon, authenticated
  using (
    public.are_event_results_public(event_id)
    or public.is_event_manager(event_id)
  );

create policy "results_manager_insert" on public.results
  for insert to authenticated
  with check (public.is_event_manager(event_id));

create policy "results_manager_update" on public.results
  for update to authenticated
  using (public.is_event_manager(event_id))
  with check (public.is_event_manager(event_id));

create policy "results_manager_delete" on public.results
  for delete to authenticated
  using (public.is_event_manager(event_id));

alter table public.heats enable row level security;
drop policy if exists "heats_public_read" on public.heats;
drop policy if exists "heats_organizer_insert" on public.heats;
drop policy if exists "heats_organizer_update" on public.heats;
drop policy if exists "heats_organizer_delete" on public.heats;
drop policy if exists "heats_public_or_manager_read" on public.heats;
drop policy if exists "heats_manager_insert" on public.heats;
drop policy if exists "heats_manager_update" on public.heats;
drop policy if exists "heats_manager_delete" on public.heats;

create policy "heats_public_or_manager_read" on public.heats
  for select to anon, authenticated
  using (public.is_public_event(event_id) or public.is_event_manager(event_id));
create policy "heats_manager_insert" on public.heats
  for insert to authenticated with check (public.is_event_manager(event_id));
create policy "heats_manager_update" on public.heats
  for update to authenticated
  using (public.is_event_manager(event_id))
  with check (public.is_event_manager(event_id));
create policy "heats_manager_delete" on public.heats
  for delete to authenticated using (public.is_event_manager(event_id));

alter table public.time_slots enable row level security;
drop policy if exists "time_slots_public_read" on public.time_slots;
drop policy if exists "time_slots_organizer_insert" on public.time_slots;
drop policy if exists "time_slots_organizer_update" on public.time_slots;
drop policy if exists "time_slots_organizer_delete" on public.time_slots;
drop policy if exists "time_slots_public_or_manager_read" on public.time_slots;
drop policy if exists "time_slots_manager_insert" on public.time_slots;
drop policy if exists "time_slots_manager_update" on public.time_slots;
drop policy if exists "time_slots_manager_delete" on public.time_slots;

create policy "time_slots_public_or_manager_read" on public.time_slots
  for select to anon, authenticated
  using (public.is_public_event(event_id) or public.is_event_manager(event_id));
create policy "time_slots_manager_insert" on public.time_slots
  for insert to authenticated with check (public.is_event_manager(event_id));
create policy "time_slots_manager_update" on public.time_slots
  for update to authenticated
  using (public.is_event_manager(event_id))
  with check (public.is_event_manager(event_id));
create policy "time_slots_manager_delete" on public.time_slots
  for delete to authenticated using (public.is_event_manager(event_id));

alter table public.schedule_assignments enable row level security;
drop policy if exists "schedule_assignments_public_read" on public.schedule_assignments;
drop policy if exists "schedule_assignments_owner_or_manager_read" on public.schedule_assignments;
drop policy if exists "schedule_assignments_manager_insert" on public.schedule_assignments;
drop policy if exists "schedule_assignments_manager_update" on public.schedule_assignments;
drop policy if exists "schedule_assignments_manager_delete" on public.schedule_assignments;

create policy "schedule_assignments_owner_or_manager_read" on public.schedule_assignments
  for select to authenticated
  using (
    exists (
      select 1
      from public.registrations registration
      where registration.id = schedule_assignments.registration_id
        and (
          public.is_participant_owner(registration.participant_id)
          or public.is_event_manager(registration.event_id)
        )
    )
  );

create policy "schedule_assignments_manager_insert" on public.schedule_assignments
  for insert to authenticated
  with check (
    exists (
      select 1
      from public.registrations registration
      join public.time_slots slot on slot.id = schedule_assignments.time_slot_id
      where registration.id = schedule_assignments.registration_id
        and registration.event_id = slot.event_id
        and public.is_event_manager(registration.event_id)
    )
  );

create policy "schedule_assignments_manager_update" on public.schedule_assignments
  for update to authenticated
  using (
    exists (
      select 1 from public.registrations registration
      where registration.id = schedule_assignments.registration_id
        and public.is_event_manager(registration.event_id)
    )
  )
  with check (
    exists (
      select 1
      from public.registrations registration
      join public.time_slots slot on slot.id = schedule_assignments.time_slot_id
      where registration.id = schedule_assignments.registration_id
        and registration.event_id = slot.event_id
        and public.is_event_manager(registration.event_id)
    )
  );

create policy "schedule_assignments_manager_delete" on public.schedule_assignments
  for delete to authenticated
  using (
    exists (
      select 1 from public.registrations registration
      where registration.id = schedule_assignments.registration_id
        and public.is_event_manager(registration.event_id)
    )
  );

alter table public.cancellation_requests enable row level security;
drop policy if exists "cancellation_requests_authenticated_insert" on public.cancellation_requests;
drop policy if exists "cancellation_requests_organizer_update" on public.cancellation_requests;
drop policy if exists "cancellation_requests_read" on public.cancellation_requests;
drop policy if exists "cancellation_requests_event_team_read" on public.cancellation_requests;
drop policy if exists "cancellation_requests_owner_or_manager_read" on public.cancellation_requests;
drop policy if exists "cancellation_requests_owner_insert" on public.cancellation_requests;
drop policy if exists "cancellation_requests_manager_update" on public.cancellation_requests;

create policy "cancellation_requests_owner_or_manager_read" on public.cancellation_requests
  for select to authenticated
  using (
    requested_by = (select auth.uid())
    or public.is_event_manager(event_id)
  );

create policy "cancellation_requests_owner_insert" on public.cancellation_requests
  for insert to authenticated
  with check (
    requested_by = (select auth.uid())
    and status = 'pending'
    and processed_at is null
    and processed_by is null
    and exists (
      select 1
      from public.registrations registration
      where registration.id = cancellation_requests.registration_id
        and registration.event_id = cancellation_requests.event_id
        and public.is_participant_owner(registration.participant_id)
    )
  );

create policy "cancellation_requests_manager_update" on public.cancellation_requests
  for update to authenticated
  using (public.is_event_manager(event_id))
  with check (
    public.is_event_manager(event_id)
    and exists (
      select 1
      from public.registrations registration
      where registration.id = cancellation_requests.registration_id
        and registration.event_id = cancellation_requests.event_id
    )
  );

-- TRUNCATE, TRIGGER and REFERENCES are not constrained by the row policies in
-- the same way as ordinary CRUD. Replace historical ALL-style grants with the
-- exact operations used by the application.
revoke all on table public.events from anon, authenticated;
grant select on table public.events to anon;
grant select, insert, update, delete on table public.events to authenticated;

revoke all on table public.results from anon, authenticated;
grant select on table public.results to anon;
grant select, insert, update, delete on table public.results to authenticated;

revoke all on table public.heats from anon, authenticated;
grant select on table public.heats to anon;
grant select, insert, update, delete on table public.heats to authenticated;

revoke all on table public.time_slots from anon, authenticated;
grant select on table public.time_slots to anon;
grant select, insert, update, delete on table public.time_slots to authenticated;

revoke all on table public.dogs from anon, authenticated;
grant select, insert, update, delete on table public.dogs to authenticated;
grant select on table public.dogs to service_role;

revoke all on table public.participants from anon, authenticated;
grant select, update, delete on table public.participants to authenticated;

revoke all on table public.registrations from anon, authenticated;
grant select, update, delete on table public.registrations to authenticated;

revoke all on table public.schedule_assignments from anon, authenticated;
grant select, insert, update, delete on table public.schedule_assignments to authenticated;

revoke all on table public.cancellation_requests from anon, authenticated;
grant select, insert, update on table public.cancellation_requests to authenticated;
