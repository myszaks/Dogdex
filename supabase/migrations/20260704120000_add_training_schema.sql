-- The training tables previously existed only in supabase/schema.sql.
-- Keep this migration before role-upgrade migrations that reference them.

create table if not exists public.trainer_profiles (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  trainer_id uuid not null unique references auth.users(id) on delete cascade,
  is_active boolean not null default false,
  full_name text not null,
  bio text,
  profile_image_url text,
  location_city text,
  location_details text,
  price_per_hour numeric(8, 2) check (price_per_hour is null or price_per_hour >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.training_types (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  trainer_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  price_per_hour numeric(8, 2) check (price_per_hour is null or price_per_hour >= 0),
  duration_min integer not null default 60 check (duration_min between 15 and 480),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.training_availability (
  id uuid primary key default gen_random_uuid(),
  training_type_id uuid not null references public.training_types(id) on delete cascade,
  day_of_week integer not null check (day_of_week between 0 and 6),
  start_time time not null,
  end_time time not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_time > start_time)
);

create table if not exists public.training_bookings (
  id uuid primary key default gen_random_uuid(),
  training_type_id uuid not null references public.training_types(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete cascade,
  dog_id uuid references public.dogs(id) on delete set null,
  scheduled_at timestamptz not null,
  duration_min integer not null default 60 check (duration_min between 15 and 480),
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'cancelled', 'completed')),
  cancellation_reason text,
  cancellation_requested_by text
    check (cancellation_requested_by is null or cancellation_requested_by in ('user', 'trainer')),
  cancellation_approved_at timestamptz,
  notes_user text,
  notes_trainer text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.training_payments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.training_bookings(id) on delete cascade,
  amount numeric(10, 2) not null check (amount >= 0),
  currency text not null default 'PLN',
  stripe_session_id text,
  stripe_payment_intent_id text,
  stripe_account_id text,
  status text not null default 'pending'
    check (status in ('pending', 'completed', 'failed', 'refunded')),
  payment_method_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.trainer_date_availability (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references auth.users(id) on delete cascade,
  available_date date not null,
  start_time time not null,
  end_time time not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (trainer_id, available_date),
  check (end_time > start_time)
);

create unique index if not exists trainer_profiles_slug_key
  on public.trainer_profiles(slug);
create unique index if not exists training_types_trainer_slug_key
  on public.training_types(trainer_id, slug);
create unique index if not exists training_payments_stripe_session_key
  on public.training_payments(stripe_session_id)
  where stripe_session_id is not null;
create unique index if not exists training_payments_payment_intent_key
  on public.training_payments(stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;

create index if not exists idx_trainer_profiles_is_active
  on public.trainer_profiles(is_active);
create index if not exists idx_trainer_profiles_trainer_id
  on public.trainer_profiles(trainer_id);
create index if not exists idx_training_types_trainer_id
  on public.training_types(trainer_id);
create index if not exists idx_training_types_is_active
  on public.training_types(is_active);
create index if not exists idx_training_availability_training_type
  on public.training_availability(training_type_id);
create index if not exists idx_training_availability_active
  on public.training_availability(is_active);
create index if not exists idx_training_bookings_user_id
  on public.training_bookings(user_id);
create index if not exists idx_training_bookings_dog_id
  on public.training_bookings(dog_id);
create index if not exists idx_training_bookings_training_type
  on public.training_bookings(training_type_id);
create index if not exists idx_training_bookings_scheduled
  on public.training_bookings(scheduled_at);
create index if not exists idx_training_bookings_status
  on public.training_bookings(status);
create index if not exists idx_training_payments_booking
  on public.training_payments(booking_id);
create index if not exists idx_training_payments_status
  on public.training_payments(status);
create index if not exists idx_trainer_date_availability_trainer_id
  on public.trainer_date_availability(trainer_id);
create index if not exists idx_trainer_date_availability_date
  on public.trainer_date_availability(available_date);

alter table public.trainer_profiles enable row level security;
alter table public.training_types enable row level security;
alter table public.training_availability enable row level security;
alter table public.training_bookings enable row level security;
alter table public.training_payments enable row level security;
alter table public.trainer_date_availability enable row level security;

drop policy if exists "trainer_profiles_select_active" on public.trainer_profiles;
create policy "trainer_profiles_select_active" on public.trainer_profiles
  for select using (is_active or auth.uid() = trainer_id);
drop policy if exists "trainer_profiles_insert_own" on public.trainer_profiles;
create policy "trainer_profiles_insert_own" on public.trainer_profiles
  for insert with check (auth.uid() = trainer_id);
drop policy if exists "trainer_profiles_update_own" on public.trainer_profiles;
create policy "trainer_profiles_update_own" on public.trainer_profiles
  for update using (auth.uid() = trainer_id) with check (auth.uid() = trainer_id);
drop policy if exists "trainer_profiles_delete_own" on public.trainer_profiles;
create policy "trainer_profiles_delete_own" on public.trainer_profiles
  for delete using (auth.uid() = trainer_id);

drop policy if exists "training_types_select_public" on public.training_types;
create policy "training_types_select_public" on public.training_types
  for select using (
    auth.uid() = trainer_id
    or (
      is_active
      and exists (
        select 1
        from public.trainer_profiles
        where trainer_profiles.trainer_id = training_types.trainer_id
          and trainer_profiles.is_active
      )
    )
  );
drop policy if exists "training_types_insert_own" on public.training_types;
create policy "training_types_insert_own" on public.training_types
  for insert with check (auth.uid() = trainer_id);
drop policy if exists "training_types_update_own" on public.training_types;
create policy "training_types_update_own" on public.training_types
  for update using (auth.uid() = trainer_id) with check (auth.uid() = trainer_id);
drop policy if exists "training_types_delete_own" on public.training_types;
create policy "training_types_delete_own" on public.training_types
  for delete using (auth.uid() = trainer_id);

drop policy if exists "training_availability_select_public" on public.training_availability;
create policy "training_availability_select_public" on public.training_availability
  for select using (
    is_active
    or auth.uid() = (
      select training_types.trainer_id
      from public.training_types
      where training_types.id = training_type_id
    )
  );
drop policy if exists "training_availability_insert_own" on public.training_availability;
create policy "training_availability_insert_own" on public.training_availability
  for insert with check (
    auth.uid() = (
      select training_types.trainer_id
      from public.training_types
      where training_types.id = training_type_id
    )
  );
drop policy if exists "training_availability_update_own" on public.training_availability;
create policy "training_availability_update_own" on public.training_availability
  for update using (
    auth.uid() = (
      select training_types.trainer_id
      from public.training_types
      where training_types.id = training_type_id
    )
  );
drop policy if exists "training_availability_delete_own" on public.training_availability;
create policy "training_availability_delete_own" on public.training_availability
  for delete using (
    auth.uid() = (
      select training_types.trainer_id
      from public.training_types
      where training_types.id = training_type_id
    )
  );

drop policy if exists "training_bookings_select_own" on public.training_bookings;
create policy "training_bookings_select_own" on public.training_bookings
  for select using (
    auth.uid() = user_id
    or auth.uid() = (
      select training_types.trainer_id
      from public.training_types
      where training_types.id = training_type_id
    )
  );
drop policy if exists "training_bookings_insert_own" on public.training_bookings;
create policy "training_bookings_insert_own" on public.training_bookings
  for insert with check (auth.uid() = user_id);
drop policy if exists "training_bookings_update_own" on public.training_bookings;
create policy "training_bookings_update_own" on public.training_bookings
  for update using (
    auth.uid() = user_id
    or auth.uid() = (
      select training_types.trainer_id
      from public.training_types
      where training_types.id = training_type_id
    )
  );
drop policy if exists "training_bookings_delete_own" on public.training_bookings;
create policy "training_bookings_delete_own" on public.training_bookings
  for delete using (auth.uid() = user_id);

drop policy if exists "training_payments_select_own" on public.training_payments;
create policy "training_payments_select_own" on public.training_payments
  for select using (
    exists (
      select 1
      from public.training_bookings
      join public.training_types
        on training_types.id = training_bookings.training_type_id
      where training_bookings.id = training_payments.booking_id
        and (
          training_bookings.user_id = auth.uid()
          or training_types.trainer_id = auth.uid()
        )
    )
  );
drop policy if exists "training_payments_insert_own" on public.training_payments;
create policy "training_payments_insert_own" on public.training_payments
  for insert with check (
    auth.uid() = (
      select training_bookings.user_id
      from public.training_bookings
      where training_bookings.id = booking_id
    )
  );
drop policy if exists "training_payments_update_own" on public.training_payments;
create policy "training_payments_update_own" on public.training_payments
  for update using (
    exists (
      select 1
      from public.training_bookings
      join public.training_types
        on training_types.id = training_bookings.training_type_id
      where training_bookings.id = training_payments.booking_id
        and (
          training_bookings.user_id = auth.uid()
          or training_types.trainer_id = auth.uid()
        )
    )
  );

drop policy if exists "trainer_date_availability_select_public"
  on public.trainer_date_availability;
create policy "trainer_date_availability_select_public"
  on public.trainer_date_availability
  for select using (is_active or auth.uid() = trainer_id);
drop policy if exists "trainer_date_availability_insert_own"
  on public.trainer_date_availability;
create policy "trainer_date_availability_insert_own"
  on public.trainer_date_availability
  for insert with check (auth.uid() = trainer_id);
drop policy if exists "trainer_date_availability_update_own"
  on public.trainer_date_availability;
create policy "trainer_date_availability_update_own"
  on public.trainer_date_availability
  for update using (auth.uid() = trainer_id) with check (auth.uid() = trainer_id);
drop policy if exists "trainer_date_availability_delete_own"
  on public.trainer_date_availability;
create policy "trainer_date_availability_delete_own"
  on public.trainer_date_availability
  for delete using (auth.uid() = trainer_id);

grant all on public.trainer_profiles to service_role;
grant all on public.training_types to service_role;
grant all on public.training_availability to service_role;
grant all on public.training_bookings to service_role;
grant all on public.training_payments to service_role;
grant all on public.trainer_date_availability to service_role;

grant select on public.trainer_profiles to anon, authenticated;
grant select on public.training_types to anon, authenticated;
grant select on public.training_availability to anon, authenticated;
grant select on public.trainer_date_availability to anon, authenticated;
grant insert, update, delete on public.trainer_profiles to authenticated;
grant insert, update, delete on public.training_types to authenticated;
grant insert, update, delete on public.training_availability to authenticated;
grant insert, update, delete on public.trainer_date_availability to authenticated;
grant select, insert, update, delete on public.training_bookings to authenticated;
grant select, insert, update on public.training_payments to authenticated;
