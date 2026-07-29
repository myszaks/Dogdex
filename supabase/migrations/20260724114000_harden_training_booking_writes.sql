-- Booking and payment state must only be changed by validated server routes
-- and signed Stripe webhooks. Authenticated clients retain read access through
-- the existing owner/trainer SELECT policies.

drop policy if exists "training_bookings_insert_own" on public.training_bookings;
drop policy if exists "training_bookings_update_own" on public.training_bookings;
drop policy if exists "training_bookings_delete_own" on public.training_bookings;

revoke insert, update, delete on table public.training_bookings from authenticated;
grant select on table public.training_bookings to authenticated;

drop policy if exists "training_payments_insert_own" on public.training_payments;
drop policy if exists "training_payments_update_own" on public.training_payments;

revoke insert, update, delete on table public.training_payments from authenticated;
grant select on table public.training_payments to authenticated;

alter table public.training_bookings
  drop constraint if exists training_bookings_duration_positive;
alter table public.training_bookings
  add constraint training_bookings_duration_positive check (duration_min > 0);

-- A trainer may offer multiple training types, so a simple unique index on
-- training_type_id is insufficient. Serialize writes per trainer and reject
-- overlapping active bookings inside the database transaction.
create or replace function public.enforce_training_booking_conflict()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  target_trainer_id uuid;
begin
  if new.status not in ('pending', 'confirmed') then
    return new;
  end if;

  select training_type.trainer_id
  into target_trainer_id
  from public.training_types training_type
  where training_type.id = new.training_type_id;

  if target_trainer_id is null then
    raise exception using
      errcode = '23503',
      message = 'training_type_not_found';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(target_trainer_id::text, 0));

  if exists (
    select 1
    from public.training_bookings booking
    join public.training_types training_type on training_type.id = booking.training_type_id
    where training_type.trainer_id = target_trainer_id
      and booking.status in ('pending', 'confirmed')
      and booking.id <> new.id
      and booking.scheduled_at < new.scheduled_at + new.duration_min * interval '1 minute'
      and booking.scheduled_at + booking.duration_min * interval '1 minute' > new.scheduled_at
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'training_booking_conflict';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_training_booking_conflict_trigger on public.training_bookings;
create trigger enforce_training_booking_conflict_trigger
  before insert or update of training_type_id, scheduled_at, duration_min, status
  on public.training_bookings
  for each row
  execute function public.enforce_training_booking_conflict();
