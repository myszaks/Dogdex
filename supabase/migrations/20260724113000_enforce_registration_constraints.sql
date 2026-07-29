-- Serialize active registration changes per event so concurrent requests
-- cannot overbook capacity or create the same email + dog registration twice.

create or replace function public.enforce_registration_constraints()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  event_capacity integer;
  participant_email text;
  participant_dog_name text;
begin
  if new.status not in ('pending', 'confirmed') then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(new.event_id::text, 0));

  select event.max_participants
  into event_capacity
  from public.events event
  where event.id = new.event_id;

  if event_capacity is not null and event_capacity > 0 and (
    select count(*)
    from public.registrations registration
    where registration.event_id = new.event_id
      and registration.status in ('pending', 'confirmed')
      and registration.id <> new.id
  ) >= event_capacity then
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

drop trigger if exists enforce_registration_constraints_trigger on public.registrations;
create trigger enforce_registration_constraints_trigger
  before insert or update of event_id, participant_id, status
  on public.registrations
  for each row
  execute function public.enforce_registration_constraints();
