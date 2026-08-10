-- Operational lifecycle for courses, passes and Stripe refunds.

alter table public.training_courses drop constraint if exists training_courses_status_check;
alter table public.training_courses add constraint training_courses_status_check
  check (status in ('draft', 'published', 'archived', 'cancelled'));
alter table public.training_courses
  add column if not exists cancellation_reason text check (cancellation_reason is null or char_length(cancellation_reason) <= 1000),
  add column if not exists cancelled_at timestamptz;

alter table public.training_course_sessions
  add column if not exists cancellation_reason text check (cancellation_reason is null or char_length(cancellation_reason) <= 1000);

alter table public.training_course_enrollments
  add column if not exists cancellation_reason text check (cancellation_reason is null or char_length(cancellation_reason) <= 1000),
  add column if not exists cancelled_at timestamptz;

alter table public.training_passes drop constraint if exists training_passes_status_check;
alter table public.training_passes add constraint training_passes_status_check
  check (status in ('pending', 'active', 'frozen', 'used', 'expired', 'cancelled'));
alter table public.training_passes
  add column if not exists frozen_at timestamptz,
  add column if not exists expiry_notification_sent_at timestamptz;

create table if not exists public.training_pass_adjustments (
  id uuid primary key default gen_random_uuid(),
  pass_id uuid not null references public.training_passes(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null check (action in ('extend', 'freeze', 'unfreeze', 'balance', 'transfer', 'refund')),
  entries_delta integer not null default 0,
  previous_expires_at date,
  next_expires_at date,
  previous_dog_id uuid references public.dogs(id) on delete set null,
  next_dog_id uuid references public.dogs(id) on delete set null,
  note text check (note is null or char_length(note) <= 500),
  created_at timestamptz not null default now()
);

create table if not exists public.training_commerce_refunds (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.training_commerce_payments(id) on delete cascade,
  requested_by uuid references auth.users(id) on delete set null,
  amount numeric(10,2) not null check (amount > 0),
  currency text not null default 'PLN' check (currency = 'PLN'),
  reason text check (reason is null or char_length(reason) <= 1000),
  status text not null default 'pending' check (status in ('pending', 'requires_action', 'succeeded', 'failed', 'canceled')),
  attempt_count integer not null default 1 check (attempt_count > 0),
  stripe_refund_id text unique,
  error_message text,
  notification_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (payment_id)
);

create index if not exists idx_training_commerce_refunds_status on public.training_commerce_refunds(status, created_at);
create index if not exists idx_training_pass_adjustments_pass on public.training_pass_adjustments(pass_id, created_at desc);
drop trigger if exists training_commerce_refunds_updated_at on public.training_commerce_refunds;
create trigger training_commerce_refunds_updated_at before update on public.training_commerce_refunds
  for each row execute function public.update_updated_at_column();

alter table public.training_pass_adjustments enable row level security;
alter table public.training_commerce_refunds enable row level security;
create policy "training_pass_adjustments_parties_read" on public.training_pass_adjustments for select to authenticated
  using (exists (
    select 1 from public.training_passes pass
    join public.training_pass_products product on product.id = pass.product_id
    where pass.id = pass_id and (pass.user_id = auth.uid() or product.trainer_id = auth.uid() or public.user_role() = 'admin')
  ));
create policy "training_commerce_refunds_parties_read" on public.training_commerce_refunds for select to authenticated
  using (exists (
    select 1 from public.training_commerce_payments payment
    where payment.id = payment_id and (payment.user_id = auth.uid() or payment.trainer_id = auth.uid() or public.user_role() = 'admin')
  ));
grant select on public.training_pass_adjustments, public.training_commerce_refunds to authenticated;
grant all on public.training_pass_adjustments, public.training_commerce_refunds to service_role;

create or replace function public.promote_training_course_waitlist(target_course_id uuid)
returns public.training_course_enrollments
language plpgsql security definer set search_path = ''
as $$
declare
  current_course public.training_courses%rowtype;
  promoted public.training_course_enrollments%rowtype;
  occupied integer;
begin
  select * into current_course from public.training_courses where id = target_course_id for update;
  if not found or current_course.status not in ('published', 'archived') then return null; end if;
  select count(*) into occupied from public.training_course_enrollments enrollment
  where enrollment.course_id = target_course_id
    and (enrollment.status = 'confirmed' or (enrollment.status = 'pending' and enrollment.approved_at is not null))
    and (enrollment.expires_at is null or enrollment.expires_at > now());
  if occupied >= current_course.capacity then return null; end if;

  select * into promoted from public.training_course_enrollments enrollment
  where enrollment.course_id = target_course_id and enrollment.status = 'waitlisted'
  order by enrollment.waitlist_position, enrollment.created_at for update skip locked limit 1;
  if not found then return null; end if;

  update public.training_course_enrollments set
    status = case
      when current_course.enrollment_mode = 'approval' then 'pending'
      when current_course.price = 0 then 'confirmed'
      else 'pending'
    end,
    payment_status = case when current_course.price = 0 then 'manual' else 'unpaid' end,
    approved_at = case when current_course.enrollment_mode = 'open' then now() else null end,
    expires_at = case when current_course.enrollment_mode = 'open' and current_course.price > 0 then now() + interval '48 hours' else null end,
    waitlist_position = null,
    updated_at = now()
  where id = promoted.id returning * into promoted;

  with ranked as (
    select id, row_number() over (order by waitlist_position, created_at) as position
    from public.training_course_enrollments where course_id = target_course_id and status = 'waitlisted'
  )
  update public.training_course_enrollments enrollment set waitlist_position = ranked.position
  from ranked where enrollment.id = ranked.id;
  return promoted;
end;
$$;

create or replace function public.consume_training_pass_for_booking(
  target_pass_id uuid,
  target_booking_id uuid,
  target_user_id uuid
)
returns public.training_passes
language plpgsql security definer set search_path = ''
as $$
declare
  current_pass public.training_passes%rowtype;
  current_product public.training_pass_products%rowtype;
  current_booking public.training_bookings%rowtype;
  booking_trainer uuid;
  result public.training_passes%rowtype;
begin
  select * into current_pass from public.training_passes where id = target_pass_id for update;
  if not found or current_pass.user_id <> target_user_id or current_pass.status <> 'active'
    or current_pass.entries_remaining < 1 or (current_pass.expires_at is not null and current_pass.expires_at < current_date) then
    raise exception using errcode = 'P0001', message = 'training_pass_unavailable';
  end if;
  select * into current_product from public.training_pass_products where id = current_pass.product_id;
  select * into current_booking from public.training_bookings where id = target_booking_id and user_id = target_user_id for update;
  if not found or current_booking.dog_id is distinct from current_pass.dog_id then
    raise exception using errcode = 'P0001', message = 'training_pass_booking_mismatch';
  end if;
  select trainer_id into booking_trainer from public.training_types where id = current_booking.training_type_id;
  if booking_trainer <> current_product.trainer_id
    or (current_product.training_type_id is not null and current_product.training_type_id <> current_booking.training_type_id) then
    raise exception using errcode = 'P0001', message = 'training_pass_product_mismatch';
  end if;
  insert into public.training_pass_usages(pass_id, booking_id, entries_used, source, note)
  values (current_pass.id, current_booking.id, 1, 'booking', 'Automatycznie przy rezerwacji treningu');
  update public.training_passes set
    entries_remaining = entries_remaining - 1,
    status = case when entries_remaining - 1 = 0 then 'used' else 'active' end,
    updated_at = now()
  where id = current_pass.id returning * into result;
  return result;
end;
$$;

create or replace function public.reverse_training_pass_booking_usage(target_booking_id uuid)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare usage public.training_pass_usages%rowtype;
begin
  select * into usage from public.training_pass_usages
  where booking_id = target_booking_id and status <> 'reversed' for update;
  if not found then return false; end if;
  update public.training_pass_usages set status = 'reversed' where id = usage.id;
  update public.training_passes set entries_remaining = least(entries_total, entries_remaining + usage.entries_used),
    status = case when status in ('used', 'active') then 'active' else status end, updated_at = now()
  where id = usage.pass_id;
  return true;
end;
$$;

create or replace function public.consume_training_pass_for_course_session(
  target_pass_id uuid,
  target_session_id uuid,
  target_enrollment_id uuid,
  target_trainer_id uuid
)
returns public.training_passes
language plpgsql security definer set search_path = ''
as $$
declare
  current_pass public.training_passes%rowtype;
  current_product public.training_pass_products%rowtype;
  current_enrollment public.training_course_enrollments%rowtype;
  current_course public.training_courses%rowtype;
  result public.training_passes%rowtype;
begin
  select * into current_pass from public.training_passes where id = target_pass_id for update;
  select * into current_product from public.training_pass_products where id = current_pass.product_id;
  select * into current_enrollment from public.training_course_enrollments where id = target_enrollment_id;
  select course.* into current_course from public.training_courses course
  join public.training_course_sessions session on session.course_id = course.id
  where session.id = target_session_id and course.id = current_enrollment.course_id;
  if exists (select 1 from public.training_pass_usages where pass_id = current_pass.id and session_id = target_session_id and status <> 'reversed') then
    return current_pass;
  end if;
  if current_pass.status <> 'active' or current_pass.entries_remaining < 1
    or current_pass.user_id <> current_enrollment.user_id or current_pass.dog_id is distinct from current_enrollment.dog_id
    or current_product.trainer_id <> target_trainer_id or current_course.trainer_id <> target_trainer_id
    or (current_product.training_type_id is not null and current_product.training_type_id is distinct from current_course.training_type_id)
    or (current_pass.expires_at is not null and current_pass.expires_at < current_date) then
    raise exception using errcode = 'P0001', message = 'training_pass_session_mismatch';
  end if;
  insert into public.training_pass_usages(pass_id, session_id, entries_used, source, note)
  values (current_pass.id, target_session_id, 1, 'session', 'Automatycznie przy obecności na zajęciach');
  update public.training_passes set entries_remaining = entries_remaining - 1,
    status = case when entries_remaining - 1 = 0 then 'used' else 'active' end, updated_at = now()
  where id = current_pass.id returning * into result;
  return result;
end;
$$;

create or replace function public.reverse_training_pass_session_usage(target_session_id uuid, target_enrollment_id uuid)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare usage public.training_pass_usages%rowtype;
  enrollment_dog uuid;
begin
  select dog_id into enrollment_dog from public.training_course_enrollments where id = target_enrollment_id;
  select pass_usage.* into usage from public.training_pass_usages pass_usage
  join public.training_passes pass on pass.id = pass_usage.pass_id
  where pass_usage.session_id = target_session_id and pass.dog_id is not distinct from enrollment_dog and pass_usage.status <> 'reversed'
  limit 1 for update of pass_usage;
  if not found then return false; end if;
  update public.training_pass_usages set status = 'reversed' where id = usage.id;
  update public.training_passes set entries_remaining = least(entries_total, entries_remaining + usage.entries_used),
    status = case when status in ('used', 'active') then 'active' else status end, updated_at = now() where id = usage.pass_id;
  return true;
end;
$$;

create or replace function public.complete_training_commerce_refund(
  target_refund_id uuid,
  target_stripe_refund_id text
)
returns table(payment_id uuid, enrollment_id uuid, pass_id uuid, course_id uuid)
language plpgsql security definer set search_path = ''
as $$
declare
  current_refund public.training_commerce_refunds%rowtype;
  current_payment public.training_commerce_payments%rowtype;
  related_course_id uuid;
begin
  select * into current_refund from public.training_commerce_refunds where id = target_refund_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'training_refund_not_found'; end if;
  if current_refund.stripe_refund_id is not null and current_refund.stripe_refund_id <> target_stripe_refund_id then
    raise exception using errcode = 'P0001', message = 'training_refund_mismatch';
  end if;
  select * into current_payment from public.training_commerce_payments where id = current_refund.payment_id for update;
  if current_refund.status = 'succeeded' then
    return query select current_payment.id, current_payment.enrollment_id, current_payment.pass_id, null::uuid;
    return;
  end if;
  update public.training_commerce_refunds set status = 'succeeded', stripe_refund_id = target_stripe_refund_id,
    error_message = null, updated_at = now() where id = current_refund.id;
  update public.training_commerce_payments set status = 'refunded', refunded_amount = amount,
    updated_at = now() where id = current_payment.id;
  if current_payment.enrollment_id is not null then
    update public.training_course_enrollments set status = 'cancelled', payment_status = 'refunded',
      cancelled_at = coalesce(cancelled_at, now()), expires_at = null, updated_at = now()
    where id = current_payment.enrollment_id returning training_course_enrollments.course_id into related_course_id;
  else
    update public.training_passes set status = 'cancelled', payment_status = 'refunded', payment_expires_at = null,
      updated_at = now() where id = current_payment.pass_id;
  end if;
  return query select current_payment.id, current_payment.enrollment_id, current_payment.pass_id, related_course_id;
end;
$$;

revoke all on function public.promote_training_course_waitlist(uuid) from public;
revoke all on function public.consume_training_pass_for_booking(uuid, uuid, uuid) from public;
revoke all on function public.reverse_training_pass_booking_usage(uuid) from public;
revoke all on function public.consume_training_pass_for_course_session(uuid, uuid, uuid, uuid) from public;
revoke all on function public.reverse_training_pass_session_usage(uuid, uuid) from public;
revoke all on function public.complete_training_commerce_refund(uuid, text) from public;
grant execute on function public.promote_training_course_waitlist(uuid) to service_role;
grant execute on function public.consume_training_pass_for_booking(uuid, uuid, uuid) to service_role;
grant execute on function public.reverse_training_pass_booking_usage(uuid) to service_role;
grant execute on function public.consume_training_pass_for_course_session(uuid, uuid, uuid, uuid) to service_role;
grant execute on function public.reverse_training_pass_session_usage(uuid, uuid) to service_role;
grant execute on function public.complete_training_commerce_refund(uuid, text) to service_role;
