-- Close public access to registration PII and scope organizer permissions
-- to events they own. The anon key is public, so RLS is the security boundary.

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
        and event.created_by = auth.uid()
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
  select exists (
    select 1
    from public.participants participant
    where participant.id = target_participant_id
      and (
        participant.user_id = auth.uid()
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
        and event.created_by = auth.uid()
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

-- Events: drafts are private; organizers may only mutate their own events.
drop policy if exists "events_public_read" on public.events;
drop policy if exists "events_organizer_insert" on public.events;
drop policy if exists "events_organizer_update" on public.events;
drop policy if exists "events_organizer_delete" on public.events;

create policy "events_public_or_owner_read" on public.events
  for select using (
    status <> 'draft'
    or created_by = auth.uid()
    or public.user_role() = 'admin'
  );

create policy "events_owner_insert" on public.events
  for insert with check (
    public.user_role() in ('organizer', 'organizer_trainer', 'admin')
    and (created_by = auth.uid() or public.user_role() = 'admin')
  );

create policy "events_owner_update" on public.events
  for update
  using (created_by = auth.uid() or public.user_role() = 'admin')
  with check (created_by = auth.uid() or public.user_role() = 'admin');

create policy "events_owner_delete" on public.events
  for delete using (created_by = auth.uid() or public.user_role() = 'admin');

-- Participants and registrations contain personal data. They are visible only
-- to the participant, the event owner, and admins. Public registration uses
-- the server-side service role route instead of direct table inserts.
drop policy if exists "participants_public_read" on public.participants;
drop policy if exists "participants_public_insert" on public.participants;
drop policy if exists "participants_organizer_update" on public.participants;
drop policy if exists "participants_organizer_delete" on public.participants;

create policy "participants_owner_or_manager_read" on public.participants
  for select using (
    public.is_participant_owner(id)
    or public.is_participant_manager(id)
  );

create policy "participants_admin_update" on public.participants
  for update
  using (public.user_role() = 'admin')
  with check (public.user_role() = 'admin');

create policy "participants_admin_delete" on public.participants
  for delete using (public.user_role() = 'admin');

drop policy if exists "registrations_public_read" on public.registrations;
drop policy if exists "registrations_public_insert" on public.registrations;
drop policy if exists "registrations_organizer_update" on public.registrations;
drop policy if exists "registrations_organizer_delete" on public.registrations;

create policy "registrations_owner_or_manager_read" on public.registrations
  for select using (
    public.is_participant_owner(participant_id)
    or public.is_event_manager(event_id)
  );

create policy "registrations_manager_update" on public.registrations
  for update
  using (public.is_event_manager(event_id))
  with check (public.is_event_manager(event_id));

create policy "registrations_manager_delete" on public.registrations
  for delete using (public.is_event_manager(event_id));

revoke all on table public.participants from anon;
revoke all on table public.registrations from anon;
revoke all on table public.participants from authenticated;
revoke all on table public.registrations from authenticated;
grant select, update, delete on table public.participants to authenticated;
grant select, update, delete on table public.registrations to authenticated;

-- Results and live data may be read publicly only when the owning event is
-- published and results_public is enabled.
drop policy if exists "results_public_read" on public.results;
drop policy if exists "results_organizer_insert" on public.results;
drop policy if exists "results_organizer_update" on public.results;
drop policy if exists "results_organizer_delete" on public.results;

create policy "results_public_or_manager_read" on public.results
  for select using (
    public.are_event_results_public(event_id)
    or public.is_event_manager(event_id)
  );

create policy "results_manager_insert" on public.results
  for insert with check (public.is_event_manager(event_id));

create policy "results_manager_update" on public.results
  for update
  using (public.is_event_manager(event_id))
  with check (public.is_event_manager(event_id));

create policy "results_manager_delete" on public.results
  for delete using (public.is_event_manager(event_id));

drop policy if exists "heats_public_read" on public.heats;
drop policy if exists "heats_organizer_insert" on public.heats;
drop policy if exists "heats_organizer_update" on public.heats;
drop policy if exists "heats_organizer_delete" on public.heats;

create policy "heats_public_or_manager_read" on public.heats
  for select using (
    public.is_public_event(event_id)
    or public.is_event_manager(event_id)
  );

create policy "heats_manager_insert" on public.heats
  for insert with check (public.is_event_manager(event_id));

create policy "heats_manager_update" on public.heats
  for update
  using (public.is_event_manager(event_id))
  with check (public.is_event_manager(event_id));

create policy "heats_manager_delete" on public.heats
  for delete using (public.is_event_manager(event_id));

drop policy if exists "time_slots_public_read" on public.time_slots;
drop policy if exists "time_slots_organizer_insert" on public.time_slots;
drop policy if exists "time_slots_organizer_update" on public.time_slots;
drop policy if exists "time_slots_organizer_delete" on public.time_slots;

create policy "time_slots_public_or_manager_read" on public.time_slots
  for select using (
    public.is_public_event(event_id)
    or public.is_event_manager(event_id)
  );

create policy "time_slots_manager_insert" on public.time_slots
  for insert with check (public.is_event_manager(event_id));

create policy "time_slots_manager_update" on public.time_slots
  for update
  using (public.is_event_manager(event_id))
  with check (public.is_event_manager(event_id));

create policy "time_slots_manager_delete" on public.time_slots
  for delete using (public.is_event_manager(event_id));

-- Assignment rows reveal participant schedules. Public pages render them via a
-- server-side service-role query after applying their own disclosure rules.
alter table public.schedule_assignments enable row level security;
drop policy if exists "schedule_assignments_public_read" on public.schedule_assignments;

create policy "schedule_assignments_owner_or_manager_read" on public.schedule_assignments
  for select using (
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
  for insert with check (
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
  for update
  using (
    exists (
      select 1
      from public.registrations registration
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
  for delete using (
    exists (
      select 1
      from public.registrations registration
      where registration.id = schedule_assignments.registration_id
        and public.is_event_manager(registration.event_id)
    )
  );

revoke all on table public.schedule_assignments from anon;
grant select, insert, update, delete on table public.schedule_assignments to authenticated;
