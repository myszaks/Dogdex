-- Cancellation requests table
-- Stores participant-initiated cancellation requests that require organizer approval.
-- cancelled_dates: NULL means cancel the entire registration.
--                  Array of ISO date strings means cancel specific multidate entries only.

create table if not exists cancellation_requests (
  id              uuid primary key default gen_random_uuid(),
  registration_id uuid not null references registrations(id) on delete cascade,
  event_id        uuid not null references events(id) on delete cascade,
  cancelled_dates text[]    default null,
  status          text      not null default 'pending'
                  check (status in ('pending', 'accepted', 'rejected')),
  requested_by    uuid      references auth.users(id) on delete set null,
  processed_at    timestamptz,
  processed_by    uuid      references auth.users(id) on delete set null,
  created_at      timestamptz not null default now()
);

create index if not exists idx_cancellation_requests_registration_id
  on cancellation_requests(registration_id);

create index if not exists idx_cancellation_requests_event_id
  on cancellation_requests(event_id);

create index if not exists idx_cancellation_requests_status
  on cancellation_requests(status);

-- RLS
alter table cancellation_requests enable row level security;

-- Owner of the request OR organizer of the event OR admin can read
drop policy if exists "cancellation_requests_public_read" on cancellation_requests;
drop policy if exists "cancellation_requests_read" on cancellation_requests;
create policy "cancellation_requests_read"
  on cancellation_requests for select
  using (
    -- The participant who made the request
    requested_by = auth.uid()
    or
    -- The organizer of the event
    exists (
      select 1 from events
      where events.id = cancellation_requests.event_id
        and events.created_by = auth.uid()
    )
    or
    -- Admins
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  );

-- Authenticated users can insert their own requests
drop policy if exists "cancellation_requests_authenticated_insert" on cancellation_requests;
create policy "cancellation_requests_authenticated_insert"
  on cancellation_requests for insert
  with check (auth.uid() is not null);

-- Organizers and admins can update (accept / reject)
drop policy if exists "cancellation_requests_organizer_update" on cancellation_requests;
create policy "cancellation_requests_organizer_update"
  on cancellation_requests for update
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role in ('organizer', 'admin')
    )
  );

-- Grants
grant all on public.cancellation_requests to service_role;
grant select on public.cancellation_requests to anon, authenticated;
grant insert, update on public.cancellation_requests to authenticated;
