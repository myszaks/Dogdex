-- Event-scoped collaboration. The event creator remains the owner; invited
-- people receive only the operational permissions selected for this event.

create table if not exists public.event_team_members (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  email text not null,
  user_id uuid references auth.users(id) on delete set null,
  permissions text[] not null,
  status text not null default 'pending' check (status in ('pending', 'active')),
  invited_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_team_members_email_normalized check (email = lower(trim(email))),
  constraint event_team_members_permissions_valid check (
    cardinality(permissions) > 0
    and permissions <@ array['registrations', 'checkin', 'results', 'finance']::text[]
  ),
  unique (event_id, email)
);

create index if not exists idx_event_team_members_user
  on public.event_team_members(user_id, event_id);
create index if not exists idx_event_team_members_email
  on public.event_team_members(lower(email), event_id);

drop trigger if exists event_team_members_updated_at on public.event_team_members;
create trigger event_team_members_updated_at
  before update on public.event_team_members
  for each row execute function public.update_updated_at_column();

alter table public.event_team_members enable row level security;

-- Kept SECURITY DEFINER so it can safely be used from policies without RLS
-- recursion. A pending invitation is valid when the account uses the invited
-- email address; the application links user_id on the first authenticated use.
create or replace function public.event_team_has_permission(
  target_event_id uuid,
  required_permission text default null
)
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
    )
    or exists (
      select 1
      from public.event_team_members member
      where member.event_id = target_event_id
        and member.status in ('pending', 'active')
        and (
          member.user_id = auth.uid()
          or lower(member.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
        )
        and (
          required_permission is null
          or required_permission = any(member.permissions)
        )
    );
$$;

revoke all on function public.event_team_has_permission(uuid, text) from public;
grant execute on function public.event_team_has_permission(uuid, text) to authenticated, service_role;

create policy "event_team_members_owner_or_self_read"
  on public.event_team_members for select to authenticated
  using (
    public.event_team_has_permission(event_id, null)
    and (
      public.user_role() = 'admin'
      or exists (
        select 1 from public.events event
        where event.id = event_team_members.event_id and event.created_by = auth.uid()
      )
      or user_id = auth.uid()
      or lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
  );

grant select on public.event_team_members to authenticated;
grant all on public.event_team_members to service_role;

-- Read access for every operational role. Write access continues to go through
-- application routes, which validate the exact permission before using the
-- service-role client.
create policy "events_event_team_read" on public.events
  for select to authenticated using (public.event_team_has_permission(id, null));

create policy "registrations_event_team_read" on public.registrations
  for select to authenticated using (public.event_team_has_permission(event_id, null));

create policy "participants_event_team_read" on public.participants
  for select to authenticated using (
    exists (
      select 1 from public.registrations registration
      where registration.participant_id = participants.id
        and public.event_team_has_permission(registration.event_id, null)
    )
    or exists (
      select 1 from public.event_waitlist_entries waitlist
      where waitlist.participant_id = participants.id
        and public.event_team_has_permission(waitlist.event_id, null)
    )
  );

create policy "cancellation_requests_event_team_read" on public.cancellation_requests
  for select to authenticated using (public.event_team_has_permission(event_id, 'registrations'));

create policy "event_waitlist_event_team_read" on public.event_waitlist_entries
  for select to authenticated using (public.event_team_has_permission(event_id, 'registrations'));

create policy "event_announcements_event_team_read" on public.event_announcements
  for select to authenticated using (public.event_team_has_permission(event_id, 'registrations'));

create policy "event_announcement_deliveries_event_team_read" on public.event_announcement_deliveries
  for select to authenticated using (
    exists (
      select 1 from public.event_announcements announcement
      where announcement.id = event_announcement_deliveries.announcement_id
        and public.event_team_has_permission(announcement.event_id, 'registrations')
    )
  );

create policy "time_slots_event_team_read" on public.time_slots
  for select to authenticated using (
    public.event_team_has_permission(event_id, 'registrations')
    or public.event_team_has_permission(event_id, 'results')
  );

create policy "schedule_assignments_event_team_read" on public.schedule_assignments
  for select to authenticated using (
    exists (
      select 1 from public.registrations registration
      where registration.id = schedule_assignments.registration_id
        and (
          public.event_team_has_permission(registration.event_id, 'registrations')
          or public.event_team_has_permission(registration.event_id, 'results')
        )
    )
  );

create policy "results_event_team_read" on public.results
  for select to authenticated using (public.event_team_has_permission(event_id, 'results'));

create policy "competition_entries_event_team_read" on public.competition_result_entries
  for select to authenticated using (public.event_team_has_permission(event_id, 'results'));

create policy "competition_calculated_event_team_read" on public.competition_calculated_results
  for select to authenticated using (public.event_team_has_permission(event_id, 'results'));

create policy "competition_live_event_team_read" on public.competition_live_state
  for select to authenticated using (public.event_team_has_permission(event_id, 'results'));

create policy "event_registration_items_finance_team_read" on public.event_registration_items
  for select to authenticated using (
    exists (
      select 1 from public.registrations registration
      where registration.id = event_registration_items.registration_id
        and public.event_team_has_permission(registration.event_id, 'finance')
    )
  );

create policy "event_payments_finance_team_read" on public.event_payments
  for select to authenticated using (
    exists (
      select 1 from public.registrations registration
      where registration.id = event_payments.registration_id
        and public.event_team_has_permission(registration.event_id, 'finance')
    )
  );

create policy "event_payment_items_finance_team_read" on public.event_payment_items
  for select to authenticated using (
    exists (
      select 1
      from public.event_payments payment
      join public.registrations registration on registration.id = payment.registration_id
      where payment.id = event_payment_items.payment_id
        and public.event_team_has_permission(registration.event_id, 'finance')
    )
  );

create policy "event_refunds_finance_team_read" on public.event_refunds
  for select to authenticated using (
    exists (
      select 1 from public.registrations registration
      where registration.id = event_refunds.registration_id
        and public.event_team_has_permission(registration.event_id, 'finance')
    )
  );

create policy "event_refund_items_finance_team_read" on public.event_refund_items
  for select to authenticated using (
    exists (
      select 1
      from public.event_refunds refund
      join public.registrations registration on registration.id = refund.registration_id
      where refund.id = event_refund_items.refund_id
        and public.event_team_has_permission(registration.event_id, 'finance')
    )
  );

create policy "event_refund_attempts_finance_team_read" on public.event_refund_attempts
  for select to authenticated using (
    exists (
      select 1
      from public.event_refunds refund
      join public.registrations registration on registration.id = refund.registration_id
      where refund.id = event_refund_attempts.refund_id
        and public.event_team_has_permission(registration.event_id, 'finance')
    )
  );
