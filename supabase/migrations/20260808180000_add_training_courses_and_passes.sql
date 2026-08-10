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
