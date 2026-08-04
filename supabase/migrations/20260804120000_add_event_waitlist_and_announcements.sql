-- Event waitlist with exclusive, expiring offers and organizer announcements.

create table if not exists public.event_waitlist_entries (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  participant_id uuid not null references public.participants(id) on delete cascade,
  form_data jsonb not null default '{}'::jsonb,
  status text not null default 'waiting'
    check (status in ('waiting', 'offered', 'converted', 'cancelled', 'expired')),
  offer_token uuid unique,
  offered_at timestamptz,
  offer_expires_at timestamptz,
  converted_registration_id uuid references public.registrations(id) on delete set null,
  converted_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_event_waitlist_entries_queue
  on public.event_waitlist_entries(event_id, created_at, id)
  where status = 'waiting';
create index if not exists idx_event_waitlist_entries_offers
  on public.event_waitlist_entries(event_id, offer_expires_at)
  where status = 'offered';
create index if not exists idx_event_waitlist_entries_participant
  on public.event_waitlist_entries(participant_id, created_at desc);

alter table public.event_waitlist_entries enable row level security;

drop policy if exists "event_waitlist_select_own_or_organizer" on public.event_waitlist_entries;
create policy "event_waitlist_select_own_or_organizer"
  on public.event_waitlist_entries for select
  using (
    exists (
      select 1
      from public.participants participant
      where participant.id = event_waitlist_entries.participant_id
        and (
          participant.user_id = auth.uid()
          or lower(participant.owner_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
        )
    )
    or exists (
      select 1
      from public.events event
      where event.id = event_waitlist_entries.event_id
        and (event.created_by = auth.uid() or public.user_role() = 'admin')
    )
  );

grant select on public.event_waitlist_entries to authenticated;
grant all on public.event_waitlist_entries to service_role;

drop trigger if exists event_waitlist_entries_updated_at on public.event_waitlist_entries;
create trigger event_waitlist_entries_updated_at
  before update on public.event_waitlist_entries
  for each row execute function public.update_updated_at_column();

create or replace function public.enforce_event_waitlist_constraints()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  participant_email text;
  participant_dog_name text;
begin
  if new.status not in ('waiting', 'offered') then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(new.event_id::text, 0));

  select participant.owner_email, participant.dog_name
  into participant_email, participant_dog_name
  from public.participants participant
  where participant.id = new.participant_id;

  if participant_email is null or participant_dog_name is null then
    raise exception 'waitlist_participant_incomplete';
  end if;

  if exists (
    select 1
    from public.registrations registration
    join public.participants participant on participant.id = registration.participant_id
    where registration.event_id = new.event_id
      and registration.status in ('pending', 'confirmed')
      and lower(participant.owner_email) = lower(participant_email)
      and lower(participant.dog_name) = lower(participant_dog_name)
  ) or exists (
    select 1
    from public.event_waitlist_entries entry
    join public.participants participant on participant.id = entry.participant_id
    where entry.event_id = new.event_id
      and entry.status in ('waiting', 'offered')
      and entry.id <> new.id
      and lower(participant.owner_email) = lower(participant_email)
      and lower(participant.dog_name) = lower(participant_dog_name)
  ) then
    raise exception using errcode = 'P0001', message = 'duplicate_waitlist_entry';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_event_waitlist_constraints_trigger on public.event_waitlist_entries;
create trigger enforce_event_waitlist_constraints_trigger
  before insert or update of event_id, participant_id, status
  on public.event_waitlist_entries
  for each row execute function public.enforce_event_waitlist_constraints();

create table if not exists public.event_announcements (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  body text not null check (char_length(body) between 1 and 5000),
  audience text not null default 'confirmed'
    check (audience in ('confirmed', 'active', 'waitlist')),
  recipient_count integer not null default 0 check (recipient_count >= 0),
  delivered_count integer not null default 0 check (delivered_count >= 0),
  failed_count integer not null default 0 check (failed_count >= 0),
  created_at timestamptz not null default now()
);

create index if not exists idx_event_announcements_event_created
  on public.event_announcements(event_id, created_at desc);

create table if not exists public.event_announcement_deliveries (
  id uuid primary key default gen_random_uuid(),
  announcement_id uuid not null references public.event_announcements(id) on delete cascade,
  participant_id uuid references public.participants(id) on delete set null,
  recipient_email text not null,
  dog_names text[] not null default '{}'::text[],
  attempt_count integer not null default 0 check (attempt_count between 0 and 10),
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'failed')),
  error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (announcement_id, recipient_email)
);

create index if not exists idx_event_announcement_deliveries_recipient
  on public.event_announcement_deliveries(lower(recipient_email), created_at desc);

alter table public.event_announcements enable row level security;
alter table public.event_announcement_deliveries enable row level security;

drop policy if exists "event_announcements_select_recipient_or_organizer" on public.event_announcements;
create policy "event_announcements_select_recipient_or_organizer"
  on public.event_announcements for select
  using (
    exists (
      select 1
      from public.event_announcement_deliveries delivery
      where delivery.announcement_id = event_announcements.id
        and delivery.status = 'sent'
        and lower(delivery.recipient_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
    or exists (
      select 1
      from public.events event
      where event.id = event_announcements.event_id
        and (event.created_by = auth.uid() or public.user_role() = 'admin')
    )
  );

drop policy if exists "event_announcement_deliveries_select_own_or_organizer" on public.event_announcement_deliveries;
create policy "event_announcement_deliveries_select_own_or_organizer"
  on public.event_announcement_deliveries for select
  using (lower(recipient_email) = lower(coalesce(auth.jwt() ->> 'email', '')));

grant select on public.event_announcements to authenticated;
grant select on public.event_announcement_deliveries to authenticated;
grant all on public.event_announcements to service_role;
grant all on public.event_announcement_deliveries to service_role;

-- Offered waitlist entries reserve capacity. The entry being converted is
-- switched to `converted` before the registration insert in the same transaction.
create or replace function public.enforce_registration_constraints()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  event_capacity integer;
  participant_email text;
  participant_dog_name text;
  active_offer_count integer;
begin
  if new.status not in ('pending', 'confirmed') then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(new.event_id::text, 0));

  select event.max_participants
  into event_capacity
  from public.events event
  where event.id = new.event_id;

  select count(*)
  into active_offer_count
  from public.event_waitlist_entries entry
  where entry.event_id = new.event_id
    and entry.status = 'offered'
    and entry.offer_expires_at > now();

  if event_capacity is not null and event_capacity > 0 and (
    select count(*)
    from public.registrations registration
    where registration.event_id = new.event_id
      and registration.status in ('pending', 'confirmed')
      and registration.id <> new.id
  ) + active_offer_count >= event_capacity then
    raise exception using
      errcode = 'P0001',
      message = 'event_capacity_reached';
  end if;

  select participant.owner_email, participant.dog_name
  into participant_email, participant_dog_name
  from public.participants participant
  where participant.id = new.participant_id;

  if participant_email is not null and participant_dog_name is not null and exists (
    select 1
    from public.registrations registration
    join public.participants participant on participant.id = registration.participant_id
    where registration.event_id = new.event_id
      and registration.status in ('pending', 'confirmed')
      and registration.id <> new.id
      and lower(participant.owner_email) = lower(participant_email)
      and lower(participant.dog_name) = lower(participant_dog_name)
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'duplicate_active_registration';
  end if;

  return new;
end;
$$;

create or replace function public.claim_next_event_waitlist_offer(
  p_event_id uuid,
  p_offer_minutes integer default 720
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_record public.events%rowtype;
  active_count integer;
  active_offer_count integer;
  claimed_id uuid;
begin
  if p_offer_minutes < 15 or p_offer_minutes > 10080 then
    raise exception 'invalid_offer_duration';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_event_id::text, 0));

  update public.event_waitlist_entries
  set status = 'expired', updated_at = now()
  where event_id = p_event_id
    and status = 'offered'
    and offer_expires_at <= now();

  select * into event_record
  from public.events
  where id = p_event_id;

  if not found
    or event_record.status <> 'upcoming'
    or event_record.max_participants is null
    or event_record.max_participants <= 0
    or (event_record.registration_deadline is not null and event_record.registration_deadline <= now()) then
    return null;
  end if;

  select count(*) into active_count
  from public.registrations
  where event_id = p_event_id and status in ('pending', 'confirmed');

  select count(*) into active_offer_count
  from public.event_waitlist_entries
  where event_id = p_event_id
    and status = 'offered'
    and offer_expires_at > now();

  if active_count + active_offer_count >= event_record.max_participants then
    return null;
  end if;

  with next_entry as (
    select id
    from public.event_waitlist_entries
    where event_id = p_event_id and status = 'waiting'
    order by created_at, id
    for update skip locked
    limit 1
  )
  update public.event_waitlist_entries entry
  set status = 'offered',
      offer_token = gen_random_uuid(),
      offered_at = now(),
      offer_expires_at = now() + make_interval(mins => p_offer_minutes),
      last_error = null,
      updated_at = now()
  from next_entry
  where entry.id = next_entry.id
  returning entry.id into claimed_id;

  return claimed_id;
end;
$$;

create or replace function public.accept_event_waitlist_offer(p_offer_token uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  entry_record public.event_waitlist_entries%rowtype;
  event_record public.events%rowtype;
  registration_id uuid;
  registration_status text;
begin
  select * into entry_record
  from public.event_waitlist_entries
  where offer_token = p_offer_token
  for update;

  if not found or entry_record.status <> 'offered' then
    raise exception 'waitlist_offer_unavailable';
  end if;
  if entry_record.offer_expires_at is null or entry_record.offer_expires_at <= now() then
    update public.event_waitlist_entries
    set status = 'expired', updated_at = now()
    where id = entry_record.id;
    raise exception 'waitlist_offer_expired';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(entry_record.event_id::text, 0));

  select * into event_record
  from public.events
  where id = entry_record.event_id;

  if not found or event_record.status <> 'upcoming'
    or (event_record.registration_deadline is not null and event_record.registration_deadline <= now()) then
    raise exception 'event_registration_closed';
  end if;

  registration_status := case
    when event_record.auto_confirm and coalesce(event_record.pricing_mode, 'free') = 'free'
      then 'confirmed'
    else 'pending'
  end;

  update public.event_waitlist_entries
  set status = 'converted', converted_at = now(), updated_at = now()
  where id = entry_record.id;

  insert into public.registrations(event_id, participant_id, status, form_data)
  values (entry_record.event_id, entry_record.participant_id, registration_status, entry_record.form_data)
  returning id into registration_id;

  update public.event_waitlist_entries
  set converted_registration_id = registration_id, updated_at = now()
  where id = entry_record.id;

  return registration_id;
end;
$$;

revoke all on function public.claim_next_event_waitlist_offer(uuid, integer) from public, anon, authenticated;
revoke all on function public.accept_event_waitlist_offer(uuid) from public, anon, authenticated;
grant execute on function public.claim_next_event_waitlist_offer(uuid, integer) to service_role;
grant execute on function public.accept_event_waitlist_offer(uuid) to service_role;
