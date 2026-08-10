-- Stripe Checkout for course enrollments and training passes.

alter table public.training_course_enrollments
  add column if not exists approved_at timestamptz,
  add column if not exists expires_at timestamptz;

alter table public.training_passes
  add column if not exists payment_expires_at timestamptz;

create table if not exists public.training_commerce_payments (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid unique references public.training_course_enrollments(id) on delete cascade,
  pass_id uuid unique references public.training_passes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  trainer_id uuid not null references auth.users(id) on delete cascade,
  amount numeric(10,2) not null check (amount > 0),
  currency text not null default 'PLN' check (currency = 'PLN'),
  status text not null default 'pending' check (status in ('pending', 'completed', 'failed', 'partially_refunded', 'refunded')),
  stripe_session_id text,
  stripe_payment_intent_id text,
  stripe_account_id text not null,
  stripe_charge_id text,
  refunded_amount numeric(10,2) not null default 0 check (refunded_amount >= 0 and refunded_amount <= amount),
  checkout_url text,
  expires_at timestamptz,
  attempt_count integer not null default 1 check (attempt_count > 0),
  completed_at timestamptz,
  confirmation_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint training_commerce_payment_target check (
    (enrollment_id is not null and pass_id is null)
    or (enrollment_id is null and pass_id is not null)
  )
);

create unique index if not exists training_commerce_payments_session_key
  on public.training_commerce_payments(stripe_session_id)
  where stripe_session_id is not null;
create unique index if not exists training_commerce_payments_intent_key
  on public.training_commerce_payments(stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;
create index if not exists idx_training_commerce_payments_user
  on public.training_commerce_payments(user_id, created_at desc);
create index if not exists idx_training_course_enrollments_expiry
  on public.training_course_enrollments(expires_at)
  where status = 'pending' and expires_at is not null;
create index if not exists idx_training_passes_payment_expiry
  on public.training_passes(payment_expires_at)
  where status = 'pending' and payment_expires_at is not null;

drop trigger if exists training_commerce_payments_updated_at on public.training_commerce_payments;
create trigger training_commerce_payments_updated_at before update on public.training_commerce_payments
  for each row execute function public.update_updated_at_column();

alter table public.training_commerce_payments enable row level security;
create policy "training_commerce_payments_parties_read" on public.training_commerce_payments
  for select to authenticated
  using (user_id = auth.uid() or trainer_id = auth.uid() or public.user_role() = 'admin');

grant select on public.training_commerce_payments to authenticated;
grant all on public.training_commerce_payments to service_role;

create or replace function public.create_training_course_enrollment(
  target_course_id uuid,
  target_user_id uuid,
  target_dog_id uuid,
  target_notes text
)
returns public.training_course_enrollments
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_course public.training_courses%rowtype;
  existing_enrollment public.training_course_enrollments%rowtype;
  occupied integer;
  waiting integer;
  initial_status text;
  initial_payment_status text;
  result public.training_course_enrollments%rowtype;
begin
  select * into current_course from public.training_courses
  where id = target_course_id for update;
  if not found or current_course.status <> 'published' then
    raise exception using errcode = 'P0001', message = 'training_course_unavailable';
  end if;

  select * into existing_enrollment from public.training_course_enrollments
  where course_id = target_course_id and user_id = target_user_id and dog_id = target_dog_id
  for update;
  if found and existing_enrollment.status <> 'cancelled' then
    raise exception using errcode = '23505', message = 'training_course_already_enrolled';
  end if;

  select count(*) into occupied from public.training_course_enrollments enrollment
  where enrollment.course_id = target_course_id
    and enrollment.id is distinct from existing_enrollment.id
    and (
      enrollment.status = 'confirmed'
      or (enrollment.status = 'pending' and (
        enrollment.payment_status = 'pending'
        or enrollment.approved_at is not null
      ))
    )
    and (enrollment.expires_at is null or enrollment.expires_at > now());

  if occupied >= current_course.capacity then
    initial_status := 'waitlisted';
    initial_payment_status := 'unpaid';
  elsif current_course.enrollment_mode = 'approval' then
    initial_status := 'pending';
    initial_payment_status := case when current_course.price = 0 then 'manual' else 'unpaid' end;
  elsif current_course.price > 0 then
    initial_status := 'pending';
    initial_payment_status := 'pending';
  else
    initial_status := 'confirmed';
    initial_payment_status := 'manual';
  end if;

  select count(*) into waiting from public.training_course_enrollments
  where course_id = target_course_id and status = 'waitlisted';

  if existing_enrollment.id is not null then
    update public.training_course_enrollments set
      status = initial_status,
      waitlist_position = case when initial_status = 'waitlisted' then waiting + 1 else null end,
      payment_status = initial_payment_status,
      notes = left(nullif(trim(target_notes), ''), 1000),
      approved_at = case when current_course.enrollment_mode = 'open' and initial_status <> 'waitlisted' then now() else null end,
      expires_at = case when initial_payment_status = 'pending' then now() + interval '35 minutes' else null end,
      updated_at = now()
    where id = existing_enrollment.id returning * into result;
  else
    insert into public.training_course_enrollments (
      course_id, user_id, dog_id, status, waitlist_position, payment_status,
      notes, approved_at, expires_at
    ) values (
      target_course_id, target_user_id, target_dog_id, initial_status,
      case when initial_status = 'waitlisted' then waiting + 1 else null end,
      initial_payment_status, left(nullif(trim(target_notes), ''), 1000),
      case when current_course.enrollment_mode = 'open' and initial_status <> 'waitlisted' then now() else null end,
      case when initial_payment_status = 'pending' then now() + interval '35 minutes' else null end
    ) returning * into result;
  end if;
  return result;
end;
$$;

create or replace function public.approve_training_course_enrollment(
  target_enrollment_id uuid,
  target_trainer_id uuid,
  manual_payment boolean default false
)
returns public.training_course_enrollments
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_enrollment public.training_course_enrollments%rowtype;
  current_course public.training_courses%rowtype;
  occupied integer;
  result public.training_course_enrollments%rowtype;
begin
  select enrollment.* into current_enrollment
  from public.training_course_enrollments enrollment
  where enrollment.id = target_enrollment_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'training_enrollment_not_found'; end if;
  if current_enrollment.status not in ('pending', 'waitlisted') then
    raise exception using errcode = 'P0001', message = 'training_enrollment_not_approvable';
  end if;

  select * into current_course from public.training_courses
  where id = current_enrollment.course_id and trainer_id = target_trainer_id for update;
  if not found then raise exception using errcode = '42501', message = 'training_course_forbidden'; end if;

  select count(*) into occupied from public.training_course_enrollments enrollment
  where enrollment.course_id = current_course.id and enrollment.id <> current_enrollment.id
    and (enrollment.status = 'confirmed' or (enrollment.status = 'pending' and enrollment.approved_at is not null))
    and (enrollment.expires_at is null or enrollment.expires_at > now());
  if occupied >= current_course.capacity then
    raise exception using errcode = 'P0001', message = 'training_course_full';
  end if;

  update public.training_course_enrollments set
    status = case when current_course.price = 0 or manual_payment then 'confirmed' else 'pending' end,
    payment_status = case when current_course.price = 0 or manual_payment then 'manual' else 'unpaid' end,
    waitlist_position = null,
    approved_at = now(),
    expires_at = case when current_course.price > 0 and not manual_payment then now() + interval '48 hours' else null end,
    updated_at = now()
  where id = current_enrollment.id returning * into result;
  return result;
end;
$$;

create or replace function public.complete_training_commerce_checkout(
  target_payment_id uuid,
  target_session_id text,
  target_payment_intent_id text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_payment public.training_commerce_payments%rowtype;
  validity_days integer;
begin
  select * into current_payment from public.training_commerce_payments
  where id = target_payment_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'training_commerce_payment_not_found'; end if;
  if current_payment.stripe_session_id is not null and current_payment.stripe_session_id <> target_session_id then
    raise exception using errcode = 'P0001', message = 'training_commerce_session_mismatch';
  end if;
  if current_payment.status = 'completed' then return false; end if;
  if current_payment.status <> 'pending' then
    raise exception using errcode = 'P0001', message = 'training_commerce_payment_not_pending';
  end if;

  update public.training_commerce_payments set
    status = 'completed', stripe_session_id = target_session_id,
    stripe_payment_intent_id = target_payment_intent_id, checkout_url = null,
    expires_at = null, completed_at = now(), updated_at = now()
  where id = current_payment.id;

  if current_payment.enrollment_id is not null then
    update public.training_course_enrollments set
      status = 'confirmed', payment_status = 'paid', expires_at = null,
      approved_at = coalesce(approved_at, now()), updated_at = now()
    where id = current_payment.enrollment_id and status = 'pending';
    if not found then raise exception using errcode = 'P0001', message = 'training_enrollment_not_payable'; end if;
  else
    select product.validity_days into validity_days
    from public.training_passes pass
    join public.training_pass_products product on product.id = pass.product_id
    where pass.id = current_payment.pass_id;
    update public.training_passes set
      status = 'active', payment_status = 'paid', valid_from = current_date,
      expires_at = current_date + validity_days, payment_expires_at = null, updated_at = now()
    where id = current_payment.pass_id and status = 'pending';
    if not found then raise exception using errcode = 'P0001', message = 'training_pass_not_payable'; end if;
  end if;
  return true;
end;
$$;

create or replace function public.fail_training_commerce_checkout(
  target_payment_id uuid,
  target_session_id text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare current_payment public.training_commerce_payments%rowtype;
begin
  select * into current_payment from public.training_commerce_payments
  where id = target_payment_id for update;
  if not found then return false; end if;
  if current_payment.stripe_session_id is not null and current_payment.stripe_session_id <> target_session_id then
    raise exception using errcode = 'P0001', message = 'training_commerce_session_mismatch';
  end if;
  if current_payment.status = 'completed' then return false; end if;
  update public.training_commerce_payments set status = 'failed', checkout_url = null, expires_at = null, updated_at = now()
  where id = current_payment.id;
  if current_payment.enrollment_id is not null then
    update public.training_course_enrollments set status = 'cancelled', payment_status = 'unpaid', expires_at = null, updated_at = now()
    where id = current_payment.enrollment_id and status = 'pending';
  else
    update public.training_passes set status = 'cancelled', payment_status = 'unpaid', payment_expires_at = null, updated_at = now()
    where id = current_payment.pass_id and status = 'pending';
  end if;
  return true;
end;
$$;

create or replace function public.reconcile_training_commerce_states()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare expired_count integer;
  approval_expired_count integer;
  pass_expired_count integer;
begin
  with expired as (
    update public.training_commerce_payments set status = 'failed', checkout_url = null, expires_at = null, updated_at = now()
    where status = 'pending' and expires_at <= now() returning enrollment_id, pass_id
  ), cancelled_enrollments as (
    update public.training_course_enrollments enrollment set status = 'cancelled', payment_status = 'unpaid', expires_at = null, updated_at = now()
    from expired where enrollment.id = expired.enrollment_id and enrollment.status = 'pending' returning enrollment.id
  ), cancelled_passes as (
    update public.training_passes pass set status = 'cancelled', payment_status = 'unpaid', payment_expires_at = null, updated_at = now()
    from expired where pass.id = expired.pass_id and pass.status = 'pending' returning pass.id
  )
  select count(*) into expired_count from expired;
  with expired_approvals as (
    update public.training_course_enrollments enrollment
    set status = 'cancelled', payment_status = 'unpaid', expires_at = null, updated_at = now()
    where enrollment.status = 'pending'
      and enrollment.payment_status = 'unpaid'
      and enrollment.approved_at is not null
      and enrollment.expires_at <= now()
    returning enrollment.id
  )
  select count(*) into approval_expired_count from expired_approvals;
  with expired_passes as (
    update public.training_passes pass set status = 'expired', updated_at = now()
    where pass.status = 'active' and pass.expires_at < current_date
    returning pass.id
  )
  select count(*) into pass_expired_count from expired_passes;
  return expired_count + approval_expired_count + pass_expired_count;
end;
$$;

revoke all on function public.create_training_course_enrollment(uuid, uuid, uuid, text) from public;
revoke all on function public.approve_training_course_enrollment(uuid, uuid, boolean) from public;
revoke all on function public.complete_training_commerce_checkout(uuid, text, text) from public;
revoke all on function public.fail_training_commerce_checkout(uuid, text) from public;
revoke all on function public.reconcile_training_commerce_states() from public;
grant execute on function public.create_training_course_enrollment(uuid, uuid, uuid, text) to service_role;
grant execute on function public.approve_training_course_enrollment(uuid, uuid, boolean) to service_role;
grant execute on function public.complete_training_commerce_checkout(uuid, text, text) to service_role;
grant execute on function public.fail_training_commerce_checkout(uuid, text) to service_role;
grant execute on function public.reconcile_training_commerce_states() to service_role;
