-- ONE-SHOT DEVELOPMENT DATABASE UPGRADE. DO NOT APPLY TO PRODUCTION.
--
-- Prepared from a read-only audit of the Dogdex dev database on 2026-08-08.
-- The dev database already contains 20260808150000 (dog documents), so that
-- source migration is intentionally excluded from this bundle.
--
-- Apply this file once as a whole. The preflight and transaction prevent a
-- partial or duplicate upgrade of a database with a different baseline.

begin;

do $$
begin
  if to_regclass('public.dogs') is null
     or to_regclass('public.events') is null
     or to_regclass('public.registrations') is null
     or to_regclass('public.event_team_members') is null
     or to_regclass('public.training_types') is null
     or to_regclass('public.training_bookings') is null
     or to_regprocedure('public.update_updated_at_column()') is null
     or to_regprocedure('public.user_role()') is null
     or to_regprocedure('public.event_team_has_permission(uuid,text)') is null then
    raise exception 'Dev baseline mismatch: required Dogdex base schema is incomplete';
  end if;

  if to_regclass('public.dog_documents') is null
     or not exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'dogs' and column_name = 'birth_date'
     )
     or not exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'events' and column_name = 'entry_requirements'
     ) then
    raise exception 'Dev baseline mismatch: dog documents migration 20260808150000 is required first';
  end if;

  if to_regclass('public.organizer_team_members') is not null
     or to_regclass('public.event_checkin_log') is not null
     or to_regclass('public.training_courses') is not null
     or to_regclass('public.training_pass_requests') is not null then
    raise exception 'Dev baseline mismatch: this one-shot bundle was already applied or the database is partially upgraded';
  end if;
end;
$$;

-- ============================================================================
-- Source migration: 20260808120000_add_organizer_team_directory.sql
-- ============================================================================

-- Reusable organizer team directory. Event access remains scoped through
-- event_team_members so every event can override the default permissions.

create table if not exists public.organizer_team_members (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  user_id uuid references auth.users(id) on delete set null,
  default_permissions text[] not null,
  auto_assign_new_events boolean not null default true,
  status text not null default 'pending' check (status in ('pending', 'active')),
  invited_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organizer_team_members_email_normalized check (email = lower(trim(email))),
  constraint organizer_team_members_permissions_valid check (
    cardinality(default_permissions) > 0
    and default_permissions <@ array['registrations', 'checkin', 'results', 'finance']::text[]
  ),
  unique (organizer_id, email)
);

create index if not exists idx_organizer_team_members_user
  on public.organizer_team_members(user_id, organizer_id);
create index if not exists idx_organizer_team_members_auto_assign
  on public.organizer_team_members(organizer_id, auto_assign_new_events)
  where auto_assign_new_events;

drop trigger if exists organizer_team_members_updated_at on public.organizer_team_members;
create trigger organizer_team_members_updated_at
  before update on public.organizer_team_members
  for each row execute function public.update_updated_at_column();

alter table public.organizer_team_members enable row level security;

drop policy if exists "organizer_team_members_owner_or_self_read" on public.organizer_team_members;
create policy "organizer_team_members_owner_or_self_read"
  on public.organizer_team_members for select to authenticated
  using (
    organizer_id = auth.uid()
    or user_id = auth.uid()
    or lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    or public.user_role() = 'admin'
  );

grant select on public.organizer_team_members to authenticated;
grant all on public.organizer_team_members to service_role;

alter table public.event_team_members
  add column if not exists organizer_team_member_id uuid
  references public.organizer_team_members(id) on delete set null;

create index if not exists idx_event_team_members_organizer_member
  on public.event_team_members(organizer_team_member_id, event_id);

create or replace function public.assign_organizer_team_to_new_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.event_team_members (
    event_id,
    email,
    user_id,
    permissions,
    status,
    invited_by,
    organizer_team_member_id
  )
  select
    new.id,
    member.email,
    member.user_id,
    member.default_permissions,
    case when member.user_id is null then 'pending' else 'active' end,
    new.created_by,
    member.id
  from public.organizer_team_members member
  where member.organizer_id = new.created_by
    and member.auto_assign_new_events
    and member.status in ('pending', 'active')
  on conflict (event_id, email) do nothing;

  return new;
end;
$$;

revoke all on function public.assign_organizer_team_to_new_event() from public;

drop trigger if exists events_assign_organizer_team on public.events;
create trigger events_assign_organizer_team
  after insert on public.events
  for each row execute function public.assign_organizer_team_to_new_event();

-- ============================================================================
-- Source migration: 20260808170000_add_event_day_2.sql
-- ============================================================================

-- Event Day 2.0: QR check-in, offline idempotency, audit trail and timing imports.

alter table public.registrations
  add column if not exists checkin_token uuid not null default gen_random_uuid();

create unique index if not exists registrations_checkin_token_key
  on public.registrations(checkin_token);

create table if not exists public.event_checkin_log (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  registration_id uuid not null references public.registrations(id) on delete cascade,
  operator_id uuid references auth.users(id) on delete set null,
  action text not null check (action in ('checked_in', 'checked_out')),
  source text not null default 'manual' check (source in ('manual', 'qr', 'offline', 'bulk')),
  client_mutation_id uuid,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index if not exists event_checkin_log_client_mutation_key
  on public.event_checkin_log(client_mutation_id)
  where client_mutation_id is not null;
create index if not exists idx_event_checkin_log_event_time
  on public.event_checkin_log(event_id, occurred_at desc);

create table if not exists public.event_start_notifications (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  registration_id uuid not null references public.registrations(id) on delete cascade,
  channel text not null default 'email' check (channel in ('email')),
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  sent_by uuid references auth.users(id) on delete set null,
  error_message text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create index if not exists idx_event_start_notifications_event
  on public.event_start_notifications(event_id, created_at desc);

create table if not exists public.event_timing_imports (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  imported_by uuid references auth.users(id) on delete set null,
  source_name text not null,
  rows_total integer not null default 0 check (rows_total >= 0),
  rows_imported integer not null default 0 check (rows_imported >= 0),
  rows_rejected integer not null default 0 check (rows_rejected >= 0),
  errors jsonb not null default '[]'::jsonb check (jsonb_typeof(errors) = 'array'),
  created_at timestamptz not null default now()
);

alter table public.event_checkin_log enable row level security;
alter table public.event_start_notifications enable row level security;
alter table public.event_timing_imports enable row level security;

create policy "event_checkin_log_team_read" on public.event_checkin_log
  for select to authenticated using (public.event_team_has_permission(event_id, 'checkin'));
create policy "event_start_notifications_team_read" on public.event_start_notifications
  for select to authenticated using (public.event_team_has_permission(event_id, 'checkin'));
create policy "event_timing_imports_team_read" on public.event_timing_imports
  for select to authenticated using (public.event_team_has_permission(event_id, 'results'));

grant select on public.event_checkin_log, public.event_start_notifications, public.event_timing_imports to authenticated;
grant all on public.event_checkin_log, public.event_start_notifications, public.event_timing_imports to service_role;

-- ============================================================================
-- Source migration: 20260808180000_add_training_courses_and_passes.sql
-- ============================================================================

-- Group classes, multi-session courses, attendance, make-ups and passes.

create table if not exists public.training_courses (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references auth.users(id) on delete cascade,
  training_type_id uuid references public.training_types(id) on delete set null,
  slug text not null,
  name text not null check (char_length(name) between 1 and 120),
  description text check (description is null or char_length(description) <= 3000),
  location text check (location is null or char_length(location) <= 300),
  capacity integer not null default 8 check (capacity between 1 and 100),
  price numeric(10,2) not null default 0 check (price >= 0),
  currency text not null default 'PLN' check (currency = 'PLN'),
  enrollment_mode text not null default 'open' check (enrollment_mode in ('open', 'approval')),
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  make_up_limit integer not null default 1 check (make_up_limit between 0 and 20),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (trainer_id, slug)
);

create table if not exists public.training_course_sessions (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.training_courses(id) on delete cascade,
  starts_at timestamptz not null,
  duration_min integer not null default 60 check (duration_min between 15 and 480),
  capacity integer check (capacity is null or capacity between 1 and 100),
  status text not null default 'scheduled' check (status in ('scheduled', 'cancelled', 'completed')),
  notes text check (notes is null or char_length(notes) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (course_id, starts_at)
);

create table if not exists public.training_course_enrollments (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.training_courses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  dog_id uuid references public.dogs(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'waitlisted', 'cancelled', 'completed')),
  waitlist_position integer check (waitlist_position is null or waitlist_position > 0),
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid', 'pending', 'paid', 'refunded', 'manual')),
  notes text check (notes is null or char_length(notes) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (course_id, user_id, dog_id)
);

create table if not exists public.training_course_attendance (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.training_course_sessions(id) on delete cascade,
  enrollment_id uuid not null references public.training_course_enrollments(id) on delete cascade,
  status text not null default 'absent' check (status in ('present', 'absent', 'excused', 'make_up')),
  make_up_for_session_id uuid references public.training_course_sessions(id) on delete set null,
  checked_by uuid references auth.users(id) on delete set null,
  checked_at timestamptz,
  notes text check (notes is null or char_length(notes) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, enrollment_id)
);

create table if not exists public.training_pass_products (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references auth.users(id) on delete cascade,
  training_type_id uuid references public.training_types(id) on delete set null,
  name text not null check (char_length(name) between 1 and 120),
  description text check (description is null or char_length(description) <= 2000),
  entries integer not null check (entries between 1 and 100),
  validity_days integer not null default 90 check (validity_days between 1 and 730),
  price numeric(10,2) not null default 0 check (price >= 0),
  currency text not null default 'PLN' check (currency = 'PLN'),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.training_passes (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.training_pass_products(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete cascade,
  dog_id uuid references public.dogs(id) on delete set null,
  entries_total integer not null check (entries_total > 0),
  entries_remaining integer not null check (entries_remaining >= 0 and entries_remaining <= entries_total),
  status text not null default 'pending' check (status in ('pending', 'active', 'used', 'expired', 'cancelled')),
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid', 'pending', 'paid', 'refunded', 'manual')),
  valid_from date,
  expires_at date,
  purchased_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.training_pass_usages (
  id uuid primary key default gen_random_uuid(),
  pass_id uuid not null references public.training_passes(id) on delete cascade,
  booking_id uuid references public.training_bookings(id) on delete set null,
  session_id uuid references public.training_course_sessions(id) on delete set null,
  entries_used integer not null default 1 check (entries_used > 0),
  source text not null default 'manual' check (source in ('manual', 'booking', 'session')),
  note text check (note is null or char_length(note) <= 500),
  status text not null default 'used' check (status in ('reserved', 'used', 'reversed')),
  created_at timestamptz not null default now(),
  constraint training_pass_usage_target check (source = 'manual' or booking_id is not null or session_id is not null)
);

create unique index if not exists training_pass_usage_booking_key
  on public.training_pass_usages(pass_id, booking_id) where booking_id is not null and status <> 'reversed';
create unique index if not exists training_pass_usage_session_key
  on public.training_pass_usages(pass_id, session_id) where session_id is not null and status <> 'reversed';
create index if not exists idx_training_courses_public on public.training_courses(status, trainer_id);
create index if not exists idx_training_course_sessions_course_time on public.training_course_sessions(course_id, starts_at);
create index if not exists idx_training_course_enrollments_course_status on public.training_course_enrollments(course_id, status);
create index if not exists idx_training_passes_user_status on public.training_passes(user_id, status);

drop trigger if exists training_courses_updated_at on public.training_courses;
create trigger training_courses_updated_at before update on public.training_courses
  for each row execute function public.update_updated_at_column();
drop trigger if exists training_course_sessions_updated_at on public.training_course_sessions;
create trigger training_course_sessions_updated_at before update on public.training_course_sessions
  for each row execute function public.update_updated_at_column();
drop trigger if exists training_course_enrollments_updated_at on public.training_course_enrollments;
create trigger training_course_enrollments_updated_at before update on public.training_course_enrollments
  for each row execute function public.update_updated_at_column();
drop trigger if exists training_course_attendance_updated_at on public.training_course_attendance;
create trigger training_course_attendance_updated_at before update on public.training_course_attendance
  for each row execute function public.update_updated_at_column();
drop trigger if exists training_pass_products_updated_at on public.training_pass_products;
create trigger training_pass_products_updated_at before update on public.training_pass_products
  for each row execute function public.update_updated_at_column();
drop trigger if exists training_passes_updated_at on public.training_passes;
create trigger training_passes_updated_at before update on public.training_passes
  for each row execute function public.update_updated_at_column();

alter table public.training_courses enable row level security;
alter table public.training_course_sessions enable row level security;
alter table public.training_course_enrollments enable row level security;
alter table public.training_course_attendance enable row level security;
alter table public.training_pass_products enable row level security;
alter table public.training_passes enable row level security;
alter table public.training_pass_usages enable row level security;

create policy "training_courses_public_or_owner_read" on public.training_courses for select
  using (status = 'published' or trainer_id = auth.uid() or public.user_role() = 'admin');
create policy "training_sessions_public_or_owner_read" on public.training_course_sessions for select
  using (exists (select 1 from public.training_courses course where course.id = course_id and (course.status = 'published' or course.trainer_id = auth.uid() or public.user_role() = 'admin')));
create policy "training_enrollments_parties_read" on public.training_course_enrollments for select to authenticated
  using (user_id = auth.uid() or exists (select 1 from public.training_courses course where course.id = course_id and course.trainer_id = auth.uid()) or public.user_role() = 'admin');
create policy "training_attendance_parties_read" on public.training_course_attendance for select to authenticated
  using (exists (select 1 from public.training_course_enrollments enrollment join public.training_courses course on course.id = enrollment.course_id where enrollment.id = enrollment_id and (enrollment.user_id = auth.uid() or course.trainer_id = auth.uid() or public.user_role() = 'admin')));
create policy "training_pass_products_public_or_owner_read" on public.training_pass_products for select
  using (is_active or trainer_id = auth.uid() or public.user_role() = 'admin');
create policy "training_passes_parties_read" on public.training_passes for select to authenticated
  using (user_id = auth.uid() or exists (select 1 from public.training_pass_products product where product.id = product_id and product.trainer_id = auth.uid()) or public.user_role() = 'admin');
create policy "training_pass_usages_parties_read" on public.training_pass_usages for select to authenticated
  using (exists (select 1 from public.training_passes pass join public.training_pass_products product on product.id = pass.product_id where pass.id = pass_id and (pass.user_id = auth.uid() or product.trainer_id = auth.uid() or public.user_role() = 'admin')));

grant select on public.training_courses, public.training_course_sessions, public.training_pass_products to anon, authenticated;
grant select on public.training_course_enrollments, public.training_course_attendance, public.training_passes, public.training_pass_usages to authenticated;
grant all on public.training_courses, public.training_course_sessions, public.training_course_enrollments, public.training_course_attendance, public.training_pass_products, public.training_passes, public.training_pass_usages to service_role;

-- ============================================================================
-- Source migration: 20260808190000_add_training_commerce_payments.sql
-- ============================================================================

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

-- ============================================================================
-- Source migration: 20260808200000_complete_training_groups_operations.sql
-- ============================================================================

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

-- ============================================================================
-- Source migration: 20260808210000_complete_training_customer_self_service.sql
-- ============================================================================

-- Customer self-service for courses and passes, with trainer-controlled entitlement changes.

alter table public.training_courses
  add column if not exists cancellation_policy text
    check (cancellation_policy is null or char_length(cancellation_policy) <= 3000),
  add column if not exists participant_message text
    check (participant_message is null or char_length(participant_message) <= 2000);

alter table public.training_pass_products
  add column if not exists cancellation_policy text
    check (cancellation_policy is null or char_length(cancellation_policy) <= 3000),
  add column if not exists freeze_policy text
    check (freeze_policy is null or char_length(freeze_policy) <= 2000);

alter table public.training_course_enrollments
  add column if not exists policy_accepted_at timestamptz,
  add column if not exists policy_snapshot text
    check (policy_snapshot is null or char_length(policy_snapshot) <= 3000);

alter table public.training_passes
  add column if not exists policy_accepted_at timestamptz,
  add column if not exists policy_snapshot text
    check (policy_snapshot is null or char_length(policy_snapshot) <= 5000);

alter table public.training_commerce_payments
  add column if not exists receipt_url text,
  add column if not exists last_reconciled_at timestamptz;

create table if not exists public.training_pass_requests (
  id uuid primary key default gen_random_uuid(),
  pass_id uuid not null references public.training_passes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  request_type text not null check (request_type in ('freeze', 'extend')),
  requested_days integer check (
    (request_type = 'freeze' and requested_days is null)
    or (request_type = 'extend' and requested_days between 1 and 730)
  ),
  reason text not null check (char_length(reason) between 3 and 1000),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  response_note text check (response_note is null or char_length(response_note) <= 1000),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists training_pass_requests_one_pending_type
  on public.training_pass_requests(pass_id, request_type)
  where status = 'pending';
create index if not exists idx_training_pass_requests_user
  on public.training_pass_requests(user_id, created_at desc);
create index if not exists idx_training_pass_requests_status
  on public.training_pass_requests(status, created_at);

drop trigger if exists training_pass_requests_updated_at on public.training_pass_requests;
create trigger training_pass_requests_updated_at before update on public.training_pass_requests
  for each row execute function public.update_updated_at_column();

alter table public.training_pass_requests enable row level security;
create policy "training_pass_requests_parties_read" on public.training_pass_requests
  for select to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1
      from public.training_passes pass
      join public.training_pass_products product on product.id = pass.product_id
      where pass.id = pass_id and product.trainer_id = auth.uid()
    )
    or public.user_role() = 'admin'
  );

grant select on public.training_pass_requests to authenticated;
grant all on public.training_pass_requests to service_role;

create or replace function public.resolve_training_pass_request(
  target_request_id uuid,
  target_trainer_id uuid,
  approve_request boolean,
  target_response_note text
)
returns public.training_pass_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_request public.training_pass_requests%rowtype;
  current_pass public.training_passes%rowtype;
  current_product public.training_pass_products%rowtype;
  result public.training_pass_requests%rowtype;
  next_expiry date;
begin
  select * into current_request
  from public.training_pass_requests
  where id = target_request_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'training_pass_request_not_found';
  end if;
  if current_request.status <> 'pending' then
    raise exception using errcode = 'P0001', message = 'training_pass_request_already_resolved';
  end if;

  select * into current_pass from public.training_passes where id = current_request.pass_id for update;
  select * into current_product from public.training_pass_products where id = current_pass.product_id;
  if current_product.trainer_id <> target_trainer_id then
    raise exception using errcode = '42501', message = 'training_pass_request_forbidden';
  end if;

  if approve_request then
    if current_request.request_type = 'freeze' then
      if current_pass.status <> 'active' then
        raise exception using errcode = 'P0001', message = 'training_pass_not_active';
      end if;
      update public.training_passes
      set status = 'frozen', frozen_at = now(), updated_at = now()
      where id = current_pass.id;
      insert into public.training_pass_adjustments(
        pass_id, actor_id, action, previous_expires_at, next_expires_at, note
      ) values (
        current_pass.id, target_trainer_id, 'freeze', current_pass.expires_at,
        current_pass.expires_at, coalesce(nullif(target_response_note, ''), current_request.reason)
      );
    else
      if current_pass.status not in ('active', 'frozen', 'expired') then
        raise exception using errcode = 'P0001', message = 'training_pass_cannot_be_extended';
      end if;
      next_expiry := greatest(coalesce(current_pass.expires_at, current_date), current_date)
        + current_request.requested_days;
      update public.training_passes
      set expires_at = next_expiry,
          status = case when status = 'expired' and entries_remaining > 0 then 'active' else status end,
          expiry_notification_sent_at = null,
          updated_at = now()
      where id = current_pass.id;
      insert into public.training_pass_adjustments(
        pass_id, actor_id, action, previous_expires_at, next_expires_at, note
      ) values (
        current_pass.id, target_trainer_id, 'extend', current_pass.expires_at,
        next_expiry, coalesce(nullif(target_response_note, ''), current_request.reason)
      );
    end if;
  end if;

  update public.training_pass_requests
  set status = case when approve_request then 'approved' else 'rejected' end,
      response_note = nullif(left(coalesce(target_response_note, ''), 1000), ''),
      reviewed_by = target_trainer_id,
      reviewed_at = now(),
      updated_at = now()
  where id = current_request.id
  returning * into result;
  return result;
end;
$$;

revoke all on function public.resolve_training_pass_request(uuid, uuid, boolean, text) from public;
grant execute on function public.resolve_training_pass_request(uuid, uuid, boolean, text) to service_role;

commit;
