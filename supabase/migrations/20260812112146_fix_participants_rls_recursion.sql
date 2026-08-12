-- Break the participants <-> registrations RLS recursion without weakening
-- participant PII access. The permission lookup runs as postgres in a private,
-- non-Data-API schema, so reads of authorization tables do not trigger their
-- own RLS policies recursively.

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

create or replace function private.can_read_participant(target_participant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and (
      -- Administrators may read every participant.
      exists (
        select 1
        from public.profiles profile
        where profile.id = auth.uid()
          and profile.role = 'admin'
      )
      -- A signed-in participant may read their own participant row. Keep the
      -- email fallback for registrations created before user_id was linked.
      or exists (
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
      )
      -- Event creator access for registered participants.
      or exists (
        select 1
        from public.registrations registration
        join public.events event on event.id = registration.event_id
        where registration.participant_id = target_participant_id
          and event.created_by = auth.uid()
      )
      -- Event-team access. This mirrors event_team_has_permission(event, null):
      -- any pending/active team member linked by user id or invited email may
      -- read the participant rows needed for that event's operational views.
      or exists (
        select 1
        from public.registrations registration
        join public.event_team_members member on member.event_id = registration.event_id
        where registration.participant_id = target_participant_id
          and member.status in ('pending', 'active')
          and (
            member.user_id = auth.uid()
            or lower(member.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
          )
      )
      -- Waitlist participant access for the event creator.
      or exists (
        select 1
        from public.event_waitlist_entries waitlist
        join public.events event on event.id = waitlist.event_id
        where waitlist.participant_id = target_participant_id
          and event.created_by = auth.uid()
      )
      -- Waitlist participant access for event-team members.
      or exists (
        select 1
        from public.event_waitlist_entries waitlist
        join public.event_team_members member on member.event_id = waitlist.event_id
        where waitlist.participant_id = target_participant_id
          and member.status in ('pending', 'active')
          and (
            member.user_id = auth.uid()
            or lower(member.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
          )
      )
    );
$$;

revoke all on function private.can_read_participant(uuid) from public;
grant execute on function private.can_read_participant(uuid) to authenticated, service_role;

-- The two policies below were individually correct, but participants_event_team_read
-- queried registrations directly. registrations RLS can in turn consult participant
-- ownership, creating a circular policy dependency. Replace both participant SELECT
-- policies with one non-recursive authorization helper.
drop policy if exists "participants_owner_or_manager_read" on public.participants;
drop policy if exists "participants_event_team_read" on public.participants;
drop policy if exists "participants_authorized_read" on public.participants;

create policy "participants_authorized_read"
on public.participants
for select
to authenticated
using (private.can_read_participant(id));
