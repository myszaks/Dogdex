-- P0: make date-based availability the canonical booking calendar and
-- centralize Stripe-driven booking state transitions.

alter table public.trainer_date_availability
  drop constraint if exists trainer_date_availability_trainer_id_available_date_key;

create unique index if not exists trainer_date_availability_exact_slot_key
  on public.trainer_date_availability (
    trainer_id,
    available_date,
    start_time,
    end_time
  );

create or replace function public.enforce_trainer_date_availability_conflict()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not new.is_active then
    return new;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(new.trainer_id::text || ':' || new.available_date::text, 0)
  );

  if exists (
    select 1
    from public.trainer_date_availability slot
    where slot.trainer_id = new.trainer_id
      and slot.available_date = new.available_date
      and slot.is_active
      and slot.id <> new.id
      and slot.start_time < new.end_time
      and slot.end_time > new.start_time
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'trainer_date_availability_conflict';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_trainer_date_availability_conflict_trigger
  on public.trainer_date_availability;
create trigger enforce_trainer_date_availability_conflict_trigger
  before insert or update of trainer_id, available_date, start_time, end_time, is_active
  on public.trainer_date_availability
  for each row
  execute function public.enforce_trainer_date_availability_conflict();

alter table public.training_bookings
  add column if not exists expires_at timestamptz,
  add column if not exists confirmed_at timestamptz,
  add column if not exists completed_at timestamptz;

create index if not exists idx_training_bookings_pending_expiry
  on public.training_bookings(expires_at)
  where status = 'pending' and expires_at is not null;

create or replace function public.complete_training_checkout(
  target_booking_id uuid,
  target_session_id text,
  target_payment_intent_id text
)
returns table (
  booking_id uuid,
  payment_id uuid,
  notification_required boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_booking public.training_bookings%rowtype;
  current_payment public.training_payments%rowtype;
begin
  select *
  into current_booking
  from public.training_bookings
  where id = target_booking_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'training_booking_not_found';
  end if;

  select *
  into current_payment
  from public.training_payments
  where training_payments.booking_id = target_booking_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'training_payment_not_found';
  end if;

  if current_payment.stripe_session_id is not null
    and current_payment.stripe_session_id <> target_session_id then
    raise exception using errcode = 'P0001', message = 'training_payment_session_mismatch';
  end if;

  if current_booking.status not in ('pending', 'confirmed') then
    raise exception using errcode = 'P0001', message = 'training_booking_not_payable';
  end if;

  update public.training_payments
  set status = 'completed',
      stripe_session_id = target_session_id,
      stripe_payment_intent_id = target_payment_intent_id,
      updated_at = now()
  where id = current_payment.id;

  update public.training_bookings
  set status = 'confirmed',
      expires_at = null,
      confirmed_at = coalesce(confirmed_at, now()),
      updated_at = now()
  where id = current_booking.id;

  return query
  select
    current_booking.id,
    current_payment.id,
    current_payment.confirmation_sent_at is null;
end;
$$;

create or replace function public.fail_training_checkout(
  target_booking_id uuid,
  target_session_id text,
  failure_reason text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_payment public.training_payments%rowtype;
begin
  select *
  into current_payment
  from public.training_payments
  where training_payments.booking_id = target_booking_id
  for update;

  if not found then
    return false;
  end if;

  if current_payment.stripe_session_id is not null
    and current_payment.stripe_session_id <> target_session_id then
    raise exception using errcode = 'P0001', message = 'training_payment_session_mismatch';
  end if;

  if current_payment.status = 'completed' then
    return false;
  end if;

  update public.training_payments
  set status = 'failed',
      stripe_session_id = coalesce(stripe_session_id, target_session_id),
      updated_at = now()
  where id = current_payment.id;

  update public.training_bookings
  set status = 'cancelled',
      expires_at = null,
      cancellation_reason = left(coalesce(failure_reason, 'Płatność nie powiodła się'), 1000),
      cancellation_requested_by = 'user',
      cancellation_approved_at = now(),
      updated_at = now()
  where id = target_booking_id
    and status = 'pending';

  return true;
end;
$$;

create or replace function public.reconcile_training_booking_states()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  expired_count integer := 0;
  completed_count integer := 0;
begin
  with expired as (
    update public.training_bookings
    set status = 'cancelled',
        expires_at = null,
        cancellation_reason = 'Sesja płatności wygasła',
        cancellation_requested_by = 'user',
        cancellation_approved_at = now(),
        updated_at = now()
    where status = 'pending'
      and expires_at is not null
      and expires_at <= now()
    returning id
  ),
  failed_payments as (
    update public.training_payments payment
    set status = 'failed',
        updated_at = now()
    from expired
    where payment.booking_id = expired.id
      and payment.status = 'pending'
    returning payment.id
  )
  select count(*) into expired_count from expired;

  with completed as (
    update public.training_bookings
    set status = 'completed',
        completed_at = coalesce(completed_at, now()),
        updated_at = now()
    where status = 'confirmed'
      and scheduled_at + duration_min * interval '1 minute' <= now()
    returning id
  )
  select count(*) into completed_count from completed;

  return jsonb_build_object(
    'expired', expired_count,
    'completed', completed_count
  );
end;
$$;

revoke all on function public.complete_training_checkout(uuid, text, text) from public;
revoke all on function public.fail_training_checkout(uuid, text, text) from public;
revoke all on function public.reconcile_training_booking_states() from public;

grant execute on function public.complete_training_checkout(uuid, text, text) to service_role;
grant execute on function public.fail_training_checkout(uuid, text, text) to service_role;
grant execute on function public.reconcile_training_booking_states() to service_role;
