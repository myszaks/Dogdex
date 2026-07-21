-- Registration opening date and database-level protection against early sign-ups.
alter table public.events
  add column if not exists registration_opens_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'events_registration_window_order_check'
      and conrelid = 'public.events'::regclass
  ) then
    alter table public.events
      add constraint events_registration_window_order_check
      check (
        registration_opens_at is null
        or registration_deadline is null
        or registration_opens_at < registration_deadline
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'events_registration_opens_before_start_check'
      and conrelid = 'public.events'::regclass
  ) then
    alter table public.events
      add constraint events_registration_opens_before_start_check
      check (
        registration_opens_at is null
        or start_at is null
        or registration_opens_at < start_at
      );
  end if;
end
$$;

drop policy if exists "registrations_public_insert" on public.registrations;
create policy "registrations_public_insert" on public.registrations
  for insert
  with check (
    exists (
      select 1
      from public.events
      where events.id = registrations.event_id
        and events.status <> 'cancelled'
        and (events.start_at is null or current_timestamp < events.start_at)
        and (events.registration_opens_at is null or current_timestamp >= events.registration_opens_at)
        and (events.registration_deadline is null or current_timestamp < events.registration_deadline)
    )
  );
