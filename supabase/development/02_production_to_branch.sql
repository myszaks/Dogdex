-- AUTO-GENERATED FILE. DO NOT EDIT DIRECTLY.
--
-- One-shot schema migration from the verified production snapshot to the
-- current Dogdex branch.
-- Apply only after 01_production_schema.sql.
-- The transaction prevents a partially upgraded development schema.
--
-- Important: this file is a deployment bundle, not an additional migration.
-- Do not apply it together with the individual source migrations.

begin;

-- ============================================================================
-- Source migration: 20260625123000_add_password_reset_throttle.sql
-- ============================================================================

-- Rate limit password reset emails to 1 request per 5 minutes per email address.

create table if not exists password_reset_requests (
  email         text primary key,
  last_sent_at   timestamptz not null default now(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create or replace function reserve_password_reset_link(
  p_email text,
  p_cooldown_seconds integer default 300
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_email text := lower(trim(coalesce(p_email, '')));
  cooldown interval := make_interval(secs => greatest(1, coalesce(p_cooldown_seconds, 300)));
  last_sent timestamptz;
begin
  if normalized_email = '' then
    return jsonb_build_object('allowed', false, 'retry_after_seconds', 0);
  end if;

  insert into password_reset_requests (email, last_sent_at, created_at, updated_at)
  values (normalized_email, now(), now(), now())
  on conflict (email) do update
    set last_sent_at = excluded.last_sent_at,
        updated_at = excluded.updated_at
    where password_reset_requests.last_sent_at <= now() - cooldown
  returning last_sent_at into last_sent;

  if found then
    return jsonb_build_object('allowed', true, 'retry_after_seconds', 0);
  end if;

  select last_sent_at into last_sent
  from password_reset_requests
  where email = normalized_email;

  return jsonb_build_object(
    'allowed', false,
    'retry_after_seconds', greatest(
      1,
      ceil(extract(epoch from (cooldown - (now() - last_sent))))::int
    )
  );
end;
$$;

grant all on public.password_reset_requests to service_role;

-- ============================================================================
-- Source migration: 20260701120000_fix_multi_registration_schedule_access.sql
-- ============================================================================

-- Link existing participant records to auth users where possible and make
-- schedule assignment reads explicit under RLS.

update public.participants p
set user_id = u.id
from auth.users u
where p.user_id is null
  and p.owner_email is not null
  and lower(p.owner_email) = lower(u.email);

create index if not exists idx_participants_user_id
  on public.participants(user_id);

create index if not exists idx_participants_dog_id
  on public.participants(dog_id);

create index if not exists idx_participants_owner_email_lower
  on public.participants(lower(owner_email));

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'schedule_assignments'
      and policyname = 'schedule_assignments_public_read'
  ) then
    create policy "schedule_assignments_public_read" on public.schedule_assignments
      for select using (true);
  end if;
end $$;

-- ============================================================================
-- Source migration: 20260704120000_add_training_schema.sql
-- ============================================================================

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

-- ============================================================================
-- Source migration: 20260627120000_require_slugs.sql
-- ============================================================================

-- Require slugs for public-facing resources.
-- UUIDs stay as relational identifiers; routes should use slug values.

create extension if not exists unaccent;

create or replace function public._dogdex_slugify(input text, fallback text default 'item')
returns text
language sql
immutable
as $$
  select coalesce(
    nullif(
      substr(
        trim(both '-' from regexp_replace(
          regexp_replace(
            regexp_replace(lower(unaccent(coalesce(input, ''))), '[^a-z0-9\s-]', '', 'g'),
            '\s+', '-', 'g'
          ),
          '-+', '-', 'g'
        )),
        1,
        80
      ),
      ''
    ),
    fallback
  );
$$;

alter table events add column if not exists slug text;

do $$
declare
  rec record;
  base text;
  candidate text;
  i int;
begin
  for rec in
    select id, title
    from events
    where slug is null or btrim(slug) = ''
    order by created_at, id
  loop
    base := public._dogdex_slugify(rec.title, 'event');
    candidate := base;
    i := 2;

    while exists (select 1 from events where slug = candidate and id <> rec.id) loop
      candidate := base || '-' || i;
      i := i + 1;
    end loop;

    update events set slug = candidate where id = rec.id;
  end loop;
end $$;

drop index if exists events_slug_key;
alter table events alter column slug set not null;
create unique index if not exists events_slug_key on events (slug);

do $$
declare
  rec record;
  base text;
  candidate text;
  i int;
begin
  if to_regclass('public.dogs') is null then
    return;
  end if;

  alter table dogs add column if not exists slug text;

  for rec in
    select id, user_id, name
    from dogs
    where slug is null or btrim(slug) = ''
    order by created_at, id
  loop
    base := public._dogdex_slugify(rec.name, 'pies');
    candidate := base;
    i := 2;

    while exists (
      select 1
      from dogs
      where user_id = rec.user_id
        and slug = candidate
        and id <> rec.id
    ) loop
      candidate := base || '-' || i;
      i := i + 1;
    end loop;

    update dogs set slug = candidate where id = rec.id;
  end loop;

  drop index if exists dogs_user_slug_unique;
  alter table dogs alter column slug set not null;
  create unique index if not exists dogs_user_slug_unique on dogs (user_id, slug);
end $$;

alter table trainer_profiles add column if not exists slug text;

do $$
declare
  rec record;
  base text;
  candidate text;
  i int;
begin
  for rec in
    select id, full_name
    from trainer_profiles
    where slug is null or btrim(slug) = ''
    order by created_at, id
  loop
    base := public._dogdex_slugify(rec.full_name, 'trener');
    candidate := base;
    i := 2;

    while exists (select 1 from trainer_profiles where slug = candidate and id <> rec.id) loop
      candidate := base || '-' || i;
      i := i + 1;
    end loop;

    update trainer_profiles set slug = candidate where id = rec.id;
  end loop;
end $$;

alter table trainer_profiles alter column slug set not null;
create unique index if not exists trainer_profiles_slug_key on trainer_profiles (slug);

alter table training_types add column if not exists slug text;

do $$
declare
  rec record;
  base text;
  candidate text;
  i int;
begin
  for rec in
    select id, trainer_id, name
    from training_types
    where slug is null or btrim(slug) = ''
    order by created_at, id
  loop
    base := public._dogdex_slugify(rec.name, 'trening');
    candidate := base;
    i := 2;

    while exists (
      select 1
      from training_types
      where trainer_id = rec.trainer_id
        and slug = candidate
        and id <> rec.id
    ) loop
      candidate := base || '-' || i;
      i := i + 1;
    end loop;

    update training_types set slug = candidate where id = rec.id;
  end loop;
end $$;

alter table training_types alter column slug set not null;
create unique index if not exists training_types_trainer_slug_key on training_types (trainer_id, slug);

drop function if exists public._dogdex_slugify(text, text);

-- ============================================================================
-- Source migration: 20260705120000_add_role_upgrade_requests.sql
-- ============================================================================

create table if not exists public.role_upgrade_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  requested_role text not null check (requested_role in ('organizer', 'trainer', 'organizer_trainer')),
  status text not null default 'pending' check (status in ('pending', 'needs_info', 'approved', 'rejected')),
  full_name text not null,
  business_name text,
  city text,
  phone text,
  experience text not null,
  verification_links jsonb not null default '[]'::jsonb check (jsonb_typeof(verification_links) = 'array'),
  certification_urls jsonb not null default '[]'::jsonb check (jsonb_typeof(certification_urls) = 'array'),
  pricing_acknowledged boolean not null default false,
  terms_accepted boolean not null default false,
  admin_notes text,
  rejection_reason text,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_role_upgrade_requests_user_id on public.role_upgrade_requests(user_id);
create index if not exists idx_role_upgrade_requests_status on public.role_upgrade_requests(status);
create index if not exists idx_role_upgrade_requests_created_at on public.role_upgrade_requests(created_at desc);

drop trigger if exists role_upgrade_requests_updated_at on public.role_upgrade_requests;
create trigger role_upgrade_requests_updated_at
  before update on public.role_upgrade_requests
  for each row execute function public.update_updated_at_column();

alter table public.role_upgrade_requests enable row level security;

drop policy if exists "role_upgrade_requests_select_own_or_admin" on public.role_upgrade_requests;
create policy "role_upgrade_requests_select_own_or_admin"
  on public.role_upgrade_requests for select
  using (auth.uid() = user_id or public.user_role() = 'admin');

drop policy if exists "role_upgrade_requests_insert_own" on public.role_upgrade_requests;
create policy "role_upgrade_requests_insert_own"
  on public.role_upgrade_requests for insert
  with check (
    auth.uid() = user_id
    and status = 'pending'
    and pricing_acknowledged = true
    and terms_accepted = true
  );

drop policy if exists "role_upgrade_requests_update_own_active" on public.role_upgrade_requests;
create policy "role_upgrade_requests_update_own_active"
  on public.role_upgrade_requests for update
  using (auth.uid() = user_id and status in ('pending', 'needs_info'))
  with check (
    auth.uid() = user_id
    and status = 'pending'
    and pricing_acknowledged = true
    and terms_accepted = true
  );

drop policy if exists "role_upgrade_requests_admin_update" on public.role_upgrade_requests;
create policy "role_upgrade_requests_admin_update"
  on public.role_upgrade_requests for update
  using (public.user_role() = 'admin')
  with check (public.user_role() = 'admin');

grant all on public.role_upgrade_requests to service_role;
grant select, insert on public.role_upgrade_requests to authenticated;

drop policy if exists "events_organizer_insert" on public.events;
create policy "events_organizer_insert" on public.events
  for insert with check (public.user_role() in ('organizer', 'organizer_trainer', 'admin'));

drop policy if exists "events_organizer_update" on public.events;
create policy "events_organizer_update" on public.events
  for update using (public.user_role() in ('organizer', 'organizer_trainer', 'admin'));

drop policy if exists "events_organizer_delete" on public.events;
create policy "events_organizer_delete" on public.events
  for delete using (public.user_role() in ('organizer', 'organizer_trainer', 'admin'));

drop policy if exists "heats_organizer_insert" on public.heats;
create policy "heats_organizer_insert" on public.heats
  for insert with check (public.user_role() in ('organizer', 'organizer_trainer', 'admin'));

drop policy if exists "heats_organizer_update" on public.heats;
create policy "heats_organizer_update" on public.heats
  for update using (public.user_role() in ('organizer', 'organizer_trainer', 'admin'));

drop policy if exists "heats_organizer_delete" on public.heats;
create policy "heats_organizer_delete" on public.heats
  for delete using (public.user_role() in ('organizer', 'organizer_trainer', 'admin'));

drop policy if exists "results_organizer_insert" on public.results;
create policy "results_organizer_insert" on public.results
  for insert with check (public.user_role() in ('organizer', 'organizer_trainer', 'admin'));

drop policy if exists "results_organizer_update" on public.results;
create policy "results_organizer_update" on public.results
  for update using (public.user_role() in ('organizer', 'organizer_trainer', 'admin'));

drop policy if exists "results_organizer_delete" on public.results;
create policy "results_organizer_delete" on public.results
  for delete using (public.user_role() in ('organizer', 'organizer_trainer', 'admin'));

drop policy if exists "registrations_organizer_update" on public.registrations;
create policy "registrations_organizer_update" on public.registrations
  for update using (public.user_role() in ('organizer', 'organizer_trainer', 'admin'));

drop policy if exists "registrations_organizer_delete" on public.registrations;
create policy "registrations_organizer_delete" on public.registrations
  for delete using (public.user_role() in ('organizer', 'organizer_trainer', 'admin'));

drop policy if exists "participants_organizer_update" on public.participants;
create policy "participants_organizer_update" on public.participants
  for update using (public.user_role() in ('organizer', 'organizer_trainer', 'admin'));

drop policy if exists "participants_organizer_delete" on public.participants;
create policy "participants_organizer_delete" on public.participants
  for delete using (public.user_role() in ('organizer', 'organizer_trainer', 'admin'));

drop policy if exists "time_slots_organizer_insert" on public.time_slots;
create policy "time_slots_organizer_insert" on public.time_slots
  for insert with check (public.user_role() in ('organizer', 'organizer_trainer', 'admin'));

drop policy if exists "time_slots_organizer_update" on public.time_slots;
create policy "time_slots_organizer_update" on public.time_slots
  for update using (public.user_role() in ('organizer', 'organizer_trainer', 'admin'));

drop policy if exists "time_slots_organizer_delete" on public.time_slots;
create policy "time_slots_organizer_delete" on public.time_slots
  for delete using (public.user_role() in ('organizer', 'organizer_trainer', 'admin'));

drop policy if exists "cancellation_requests_organizer_update" on public.cancellation_requests;
create policy "cancellation_requests_organizer_update"
  on public.cancellation_requests for update
  using (
    exists (
      select 1
      from public.events
      join public.profiles on profiles.id = auth.uid()
      where events.id = cancellation_requests.event_id
        and events.created_by = auth.uid()
        and profiles.role in ('organizer', 'organizer_trainer', 'admin')
    )
    or public.user_role() = 'admin'
  );

drop policy if exists "trainer_profiles_insert_own" on public.trainer_profiles;
create policy "trainer_profiles_insert_own" on public.trainer_profiles
  for insert with check (
    auth.uid() = trainer_id
    and public.user_role() in ('trainer', 'organizer_trainer', 'admin')
  );

drop policy if exists "trainer_profiles_update_own" on public.trainer_profiles;
create policy "trainer_profiles_update_own" on public.trainer_profiles
  for update using (
    auth.uid() = trainer_id
    and public.user_role() in ('trainer', 'organizer_trainer', 'admin')
  );

drop policy if exists "trainer_profiles_delete_own" on public.trainer_profiles;
create policy "trainer_profiles_delete_own" on public.trainer_profiles
  for delete using (
    auth.uid() = trainer_id
    and public.user_role() in ('trainer', 'organizer_trainer', 'admin')
  );

drop policy if exists "training_types_insert_own" on public.training_types;
create policy "training_types_insert_own" on public.training_types
  for insert with check (
    auth.uid() = trainer_id
    and public.user_role() in ('trainer', 'organizer_trainer', 'admin')
  );

drop policy if exists "training_types_update_own" on public.training_types;
create policy "training_types_update_own" on public.training_types
  for update using (
    auth.uid() = trainer_id
    and public.user_role() in ('trainer', 'organizer_trainer', 'admin')
  );

drop policy if exists "training_types_delete_own" on public.training_types;
create policy "training_types_delete_own" on public.training_types
  for delete using (
    auth.uid() = trainer_id
    and public.user_role() in ('trainer', 'organizer_trainer', 'admin')
  );

drop policy if exists "training_availability_insert_own" on public.training_availability;
create policy "training_availability_insert_own" on public.training_availability
  for insert with check (
    public.user_role() in ('trainer', 'organizer_trainer', 'admin')
    and auth.uid() = (select trainer_id from public.training_types where id = training_type_id)
  );

drop policy if exists "training_availability_update_own" on public.training_availability;
create policy "training_availability_update_own" on public.training_availability
  for update using (
    public.user_role() in ('trainer', 'organizer_trainer', 'admin')
    and auth.uid() = (select trainer_id from public.training_types where id = training_type_id)
  );

drop policy if exists "training_availability_delete_own" on public.training_availability;
create policy "training_availability_delete_own" on public.training_availability
  for delete using (
    public.user_role() in ('trainer', 'organizer_trainer', 'admin')
    and auth.uid() = (select trainer_id from public.training_types where id = training_type_id)
  );

drop policy if exists "trainer_date_availability_insert_own" on public.trainer_date_availability;
create policy "trainer_date_availability_insert_own" on public.trainer_date_availability
  for insert with check (
    auth.uid() = trainer_id
    and public.user_role() in ('trainer', 'organizer_trainer', 'admin')
  );

drop policy if exists "trainer_date_availability_update_own" on public.trainer_date_availability;
create policy "trainer_date_availability_update_own" on public.trainer_date_availability
  for update using (
    auth.uid() = trainer_id
    and public.user_role() in ('trainer', 'organizer_trainer', 'admin')
  );

drop policy if exists "trainer_date_availability_delete_own" on public.trainer_date_availability;
create policy "trainer_date_availability_delete_own" on public.trainer_date_availability
  for delete using (
    auth.uid() = trainer_id
    and public.user_role() in ('trainer', 'organizer_trainer', 'admin')
  );

-- ============================================================================
-- Source migration: 20260706130000_add_event_draft_status.sql
-- ============================================================================

alter table public.events
  drop constraint if exists events_status_check;

alter table public.events
  add constraint events_status_check
  check (status in ('draft', 'upcoming', 'ongoing', 'finished', 'cancelled'));

-- ============================================================================
-- Source migration: 20260707120000_add_training_bookings_dog_fk.sql
-- ============================================================================

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'training_bookings_dog_id_fkey'
      and conrelid = 'public.training_bookings'::regclass
  ) then
    alter table public.training_bookings
      add constraint training_bookings_dog_id_fkey
      foreign key (dog_id)
      references public.dogs(id)
      on delete set null
      not valid;
  end if;
end $$;

create index if not exists idx_training_bookings_dog_id
  on public.training_bookings(dog_id);

-- ============================================================================
-- Source migration: 20260724110000_harden_event_data_rls.sql
-- ============================================================================

-- Close public access to registration PII and scope organizer permissions
-- to events they own. The anon key is public, so RLS is the security boundary.

create or replace function public.is_event_manager(target_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    public.user_role() = 'admin'
    or exists (
      select 1
      from public.events event
      where event.id = target_event_id
        and event.created_by = auth.uid()
    );
$$;

create or replace function public.is_public_event(target_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.events event
    where event.id = target_event_id
      and event.status <> 'draft'
  );
$$;

create or replace function public.are_event_results_public(target_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.events event
    where event.id = target_event_id
      and event.status <> 'draft'
      and event.results_public = true
  );
$$;

create or replace function public.is_participant_owner(target_participant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.participants participant
    where participant.id = target_participant_id
      and (
        participant.user_id = auth.uid()
        or (
          participant.owner_email is not null
          and lower(participant.owner_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
        )
      )
  );
$$;

create or replace function public.is_participant_manager(target_participant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    public.user_role() = 'admin'
    or exists (
      select 1
      from public.registrations registration
      join public.events event on event.id = registration.event_id
      where registration.participant_id = target_participant_id
        and event.created_by = auth.uid()
    );
$$;

revoke all on function public.is_event_manager(uuid) from public;
revoke all on function public.is_public_event(uuid) from public;
revoke all on function public.are_event_results_public(uuid) from public;
revoke all on function public.is_participant_owner(uuid) from public;
revoke all on function public.is_participant_manager(uuid) from public;

grant execute on function public.is_event_manager(uuid) to authenticated, service_role;
grant execute on function public.is_public_event(uuid) to anon, authenticated, service_role;
grant execute on function public.are_event_results_public(uuid) to anon, authenticated, service_role;
grant execute on function public.is_participant_owner(uuid) to authenticated, service_role;
grant execute on function public.is_participant_manager(uuid) to authenticated, service_role;

-- Events: drafts are private; organizers may only mutate their own events.
drop policy if exists "events_public_read" on public.events;
drop policy if exists "events_organizer_insert" on public.events;
drop policy if exists "events_organizer_update" on public.events;
drop policy if exists "events_organizer_delete" on public.events;

create policy "events_public_or_owner_read" on public.events
  for select using (
    status <> 'draft'
    or created_by = auth.uid()
    or public.user_role() = 'admin'
  );

create policy "events_owner_insert" on public.events
  for insert with check (
    public.user_role() in ('organizer', 'organizer_trainer', 'admin')
    and (created_by = auth.uid() or public.user_role() = 'admin')
  );

create policy "events_owner_update" on public.events
  for update
  using (created_by = auth.uid() or public.user_role() = 'admin')
  with check (created_by = auth.uid() or public.user_role() = 'admin');

create policy "events_owner_delete" on public.events
  for delete using (created_by = auth.uid() or public.user_role() = 'admin');

-- Participants and registrations contain personal data. They are visible only
-- to the participant, the event owner, and admins. Public registration uses
-- the server-side service role route instead of direct table inserts.
drop policy if exists "participants_public_read" on public.participants;
drop policy if exists "participants_public_insert" on public.participants;
drop policy if exists "participants_organizer_update" on public.participants;
drop policy if exists "participants_organizer_delete" on public.participants;

create policy "participants_owner_or_manager_read" on public.participants
  for select using (
    public.is_participant_owner(id)
    or public.is_participant_manager(id)
  );

create policy "participants_admin_update" on public.participants
  for update
  using (public.user_role() = 'admin')
  with check (public.user_role() = 'admin');

create policy "participants_admin_delete" on public.participants
  for delete using (public.user_role() = 'admin');

drop policy if exists "registrations_public_read" on public.registrations;
drop policy if exists "registrations_public_insert" on public.registrations;
drop policy if exists "registrations_organizer_update" on public.registrations;
drop policy if exists "registrations_organizer_delete" on public.registrations;

create policy "registrations_owner_or_manager_read" on public.registrations
  for select using (
    public.is_participant_owner(participant_id)
    or public.is_event_manager(event_id)
  );

create policy "registrations_manager_update" on public.registrations
  for update
  using (public.is_event_manager(event_id))
  with check (public.is_event_manager(event_id));

create policy "registrations_manager_delete" on public.registrations
  for delete using (public.is_event_manager(event_id));

revoke all on table public.participants from anon;
revoke all on table public.registrations from anon;
revoke all on table public.participants from authenticated;
revoke all on table public.registrations from authenticated;
grant select, update, delete on table public.participants to authenticated;
grant select, update, delete on table public.registrations to authenticated;

-- Results and live data may be read publicly only when the owning event is
-- published and results_public is enabled.
drop policy if exists "results_public_read" on public.results;
drop policy if exists "results_organizer_insert" on public.results;
drop policy if exists "results_organizer_update" on public.results;
drop policy if exists "results_organizer_delete" on public.results;

create policy "results_public_or_manager_read" on public.results
  for select using (
    public.are_event_results_public(event_id)
    or public.is_event_manager(event_id)
  );

create policy "results_manager_insert" on public.results
  for insert with check (public.is_event_manager(event_id));

create policy "results_manager_update" on public.results
  for update
  using (public.is_event_manager(event_id))
  with check (public.is_event_manager(event_id));

create policy "results_manager_delete" on public.results
  for delete using (public.is_event_manager(event_id));

drop policy if exists "heats_public_read" on public.heats;
drop policy if exists "heats_organizer_insert" on public.heats;
drop policy if exists "heats_organizer_update" on public.heats;
drop policy if exists "heats_organizer_delete" on public.heats;

create policy "heats_public_or_manager_read" on public.heats
  for select using (
    public.is_public_event(event_id)
    or public.is_event_manager(event_id)
  );

create policy "heats_manager_insert" on public.heats
  for insert with check (public.is_event_manager(event_id));

create policy "heats_manager_update" on public.heats
  for update
  using (public.is_event_manager(event_id))
  with check (public.is_event_manager(event_id));

create policy "heats_manager_delete" on public.heats
  for delete using (public.is_event_manager(event_id));

drop policy if exists "time_slots_public_read" on public.time_slots;
drop policy if exists "time_slots_organizer_insert" on public.time_slots;
drop policy if exists "time_slots_organizer_update" on public.time_slots;
drop policy if exists "time_slots_organizer_delete" on public.time_slots;

create policy "time_slots_public_or_manager_read" on public.time_slots
  for select using (
    public.is_public_event(event_id)
    or public.is_event_manager(event_id)
  );

create policy "time_slots_manager_insert" on public.time_slots
  for insert with check (public.is_event_manager(event_id));

create policy "time_slots_manager_update" on public.time_slots
  for update
  using (public.is_event_manager(event_id))
  with check (public.is_event_manager(event_id));

create policy "time_slots_manager_delete" on public.time_slots
  for delete using (public.is_event_manager(event_id));

-- Assignment rows reveal participant schedules. Public pages render them via a
-- server-side service-role query after applying their own disclosure rules.
alter table public.schedule_assignments enable row level security;
drop policy if exists "schedule_assignments_public_read" on public.schedule_assignments;

create policy "schedule_assignments_owner_or_manager_read" on public.schedule_assignments
  for select using (
    exists (
      select 1
      from public.registrations registration
      where registration.id = schedule_assignments.registration_id
        and (
          public.is_participant_owner(registration.participant_id)
          or public.is_event_manager(registration.event_id)
        )
    )
  );

create policy "schedule_assignments_manager_insert" on public.schedule_assignments
  for insert with check (
    exists (
      select 1
      from public.registrations registration
      join public.time_slots slot on slot.id = schedule_assignments.time_slot_id
      where registration.id = schedule_assignments.registration_id
        and registration.event_id = slot.event_id
        and public.is_event_manager(registration.event_id)
    )
  );

create policy "schedule_assignments_manager_update" on public.schedule_assignments
  for update
  using (
    exists (
      select 1
      from public.registrations registration
      where registration.id = schedule_assignments.registration_id
        and public.is_event_manager(registration.event_id)
    )
  )
  with check (
    exists (
      select 1
      from public.registrations registration
      join public.time_slots slot on slot.id = schedule_assignments.time_slot_id
      where registration.id = schedule_assignments.registration_id
        and registration.event_id = slot.event_id
        and public.is_event_manager(registration.event_id)
    )
  );

create policy "schedule_assignments_manager_delete" on public.schedule_assignments
  for delete using (
    exists (
      select 1
      from public.registrations registration
      where registration.id = schedule_assignments.registration_id
        and public.is_event_manager(registration.event_id)
    )
  );

revoke all on table public.schedule_assignments from anon;
grant select, insert, update, delete on table public.schedule_assignments to authenticated;

-- ============================================================================
-- Source migration: 20260724112000_harden_event_storage.sql
-- ============================================================================

-- Store event media below the uploader's user-id folder so one organizer
-- cannot overwrite or delete another organizer's files.

drop policy if exists "event_thumbnails_auth_insert" on storage.objects;
drop policy if exists "event_thumbnails_auth_delete" on storage.objects;

create policy "event_thumbnails_owner_insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'event-thumbnails'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.user_role() = 'admin'
    )
  );

create policy "event_thumbnails_owner_delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'event-thumbnails'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.user_role() = 'admin'
    )
  );

-- ============================================================================
-- Source migration: 20260724112500_add_stripe_profile_columns.sql
-- ============================================================================

alter table public.profiles
  add column if not exists stripe_account_id text;

alter table public.profiles
  add column if not exists stripe_onboarded boolean not null default false;

-- ============================================================================
-- Source migration: 20260724113000_enforce_registration_constraints.sql
-- ============================================================================

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

-- ============================================================================
-- Source migration: 20260724114000_harden_training_booking_writes.sql
-- ============================================================================

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

-- ============================================================================
-- Source migration: 20260724115000_add_public_rate_limits.sql
-- ============================================================================

create table if not exists public.public_rate_limits (
  scope text not null,
  identifier_hash text not null,
  window_started_at timestamptz not null default now(),
  request_count integer not null default 1 check (request_count > 0),
  primary key (scope, identifier_hash)
);

alter table public.public_rate_limits enable row level security;

revoke all on public.public_rate_limits from anon, authenticated;
grant all on public.public_rate_limits to service_role;

create or replace function public.consume_public_rate_limit(
  p_scope text,
  p_identifier_hash text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_request_count integer;
begin
  if
    length(trim(coalesce(p_scope, ''))) = 0
    or length(trim(coalesce(p_identifier_hash, ''))) = 0
    or p_limit < 1
    or p_window_seconds < 1
  then
    raise exception 'invalid_rate_limit_parameters';
  end if;

  insert into public.public_rate_limits (
    scope,
    identifier_hash,
    window_started_at,
    request_count
  )
  values (
    p_scope,
    p_identifier_hash,
    now(),
    1
  )
  on conflict (scope, identifier_hash) do update
    set
      window_started_at = case
        when public.public_rate_limits.window_started_at
          <= now() - make_interval(secs => p_window_seconds)
        then now()
        else public.public_rate_limits.window_started_at
      end,
      request_count = case
        when public.public_rate_limits.window_started_at
          <= now() - make_interval(secs => p_window_seconds)
        then 1
        else public.public_rate_limits.request_count + 1
      end
  returning request_count into v_request_count;

  return v_request_count <= p_limit;
end;
$$;

revoke all on function public.consume_public_rate_limit(text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_public_rate_limit(text, text, integer, integer)
  to service_role;

-- ============================================================================
-- Source migration: 20260724115500_harden_trainer_storage.sql
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('trainers', 'trainers', true)
on conflict (id) do update set public = true;

drop policy if exists "trainer_photos_public_read" on storage.objects;
create policy "trainer_photos_public_read"
  on storage.objects for select
  using (bucket_id = 'trainers');

drop policy if exists "trainer_photos_insert_own_folder" on storage.objects;
create policy "trainer_photos_insert_own_folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'trainers'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.user_role() in ('trainer', 'organizer_trainer', 'admin')
  );

drop policy if exists "trainer_photos_delete_own_folder" on storage.objects;
create policy "trainer_photos_delete_own_folder"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'trainers'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.user_role() in ('trainer', 'organizer_trainer', 'admin')
  );

-- ============================================================================
-- Source migration: 20260724116000_add_training_payment_notification_state.sql
-- ============================================================================

alter table public.training_payments
  add column if not exists confirmation_sent_at timestamptz;

-- ============================================================================
-- Source migration: 20260729120000_add_configurable_competition_engine.sql
-- ============================================================================

-- Configurable competition formats are stored as immutable version rows.
-- Events keep their own definition snapshot so historical calculations remain
-- reproducible even when an organizer creates a newer version of a format.

create table public.competition_formats (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null default gen_random_uuid(),
  previous_version_id uuid references public.competition_formats(id) on delete set null,
  version integer not null default 1 check (version > 0),
  name text not null check (char_length(name) between 1 and 120),
  description text,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  definition jsonb not null check (jsonb_typeof(definition) = 'object'),
  created_by uuid references auth.users(id) on delete cascade,
  is_system boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (family_id, version)
);

create unique index competition_formats_one_draft_per_family
  on public.competition_formats(family_id)
  where status = 'draft';
create index competition_formats_created_by_idx
  on public.competition_formats(created_by, updated_at desc);
create index competition_formats_public_idx
  on public.competition_formats(status, is_system)
  where status = 'published';

create or replace function public.prevent_published_competition_format_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status in ('published', 'archived')
    and (
      new.definition is distinct from old.definition
      or new.name is distinct from old.name
      or new.description is distinct from old.description
      or new.family_id is distinct from old.family_id
      or new.version is distinct from old.version
      or new.previous_version_id is distinct from old.previous_version_id
      or new.created_by is distinct from old.created_by
      or new.is_system is distinct from old.is_system
    )
  then
    raise exception 'Published competition format versions are immutable';
  end if;
  return new;
end;
$$;

create trigger prevent_published_competition_format_change
  before update on public.competition_formats
  for each row execute function public.prevent_published_competition_format_change();

alter table public.events
  add column competition_format_id uuid references public.competition_formats(id) on delete set null,
  add column competition_config jsonb check (
    competition_config is null or jsonb_typeof(competition_config) = 'object'
  ),
  add column competition_values jsonb not null default '{}'::jsonb check (
    jsonb_typeof(competition_values) = 'object'
  ),
  add column competition_config_revision integer not null default 1 check (
    competition_config_revision > 0
  ),
  add column competition_config_locked_at timestamptz;

create index events_competition_format_id_idx
  on public.events(competition_format_id)
  where competition_format_id is not null;

create table public.competition_result_entries (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  participant_id uuid not null references public.participants(id) on delete cascade,
  stage_id text not null,
  attempt_id text not null,
  status text,
  values jsonb not null default '{}'::jsonb check (jsonb_typeof(values) = 'object'),
  revision integer not null default 1 check (revision > 0),
  recorded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, participant_id, stage_id, attempt_id)
);

create index competition_result_entries_event_idx
  on public.competition_result_entries(event_id, stage_id, attempt_id);
create index competition_result_entries_participant_idx
  on public.competition_result_entries(participant_id);

create table public.competition_calculated_results (
  event_id uuid not null references public.events(id) on delete cascade,
  participant_id uuid not null references public.participants(id) on delete cascade,
  computed jsonb not null default '{}'::jsonb check (jsonb_typeof(computed) = 'object'),
  groups jsonb not null default '{}'::jsonb check (jsonb_typeof(groups) = 'object'),
  ranks jsonb not null default '{}'::jsonb check (jsonb_typeof(ranks) = 'object'),
  source_revision integer not null default 1 check (source_revision > 0),
  engine_version integer not null default 1 check (engine_version > 0),
  recalculated_at timestamptz not null default now(),
  primary key (event_id, participant_id)
);

create index competition_calculated_results_event_idx
  on public.competition_calculated_results(event_id);

create table public.competition_live_state (
  event_id uuid primary key references public.events(id) on delete cascade,
  view_id text,
  phase text,
  current_stage_id text,
  current_attempt_id text,
  current_participant_id uuid references public.participants(id) on delete set null,
  cursor integer not null default 0 check (cursor >= 0),
  state jsonb not null default '{}'::jsonb check (jsonb_typeof(state) = 'object'),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create or replace function public.lock_event_competition_config()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.events
  set competition_config_locked_at = coalesce(competition_config_locked_at, now())
  where id = new.event_id;
  return new;
end;
$$;

create trigger lock_event_competition_config_on_first_entry
  before insert on public.competition_result_entries
  for each row execute function public.lock_event_competition_config();

create or replace function public.prevent_locked_competition_config_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.competition_config_locked_at is not null
    and (
      new.competition_config is distinct from old.competition_config
      or new.competition_format_id is distinct from old.competition_format_id
      or new.competition_values is distinct from old.competition_values
    )
  then
    raise exception 'Competition configuration is locked after the first result entry';
  end if;
  return new;
end;
$$;

create trigger prevent_locked_event_competition_config_change
  before update on public.events
  for each row execute function public.prevent_locked_competition_config_change();

revoke all on function public.prevent_published_competition_format_change() from public;
revoke all on function public.lock_event_competition_config() from public;
revoke all on function public.prevent_locked_competition_config_change() from public;

alter table public.competition_formats enable row level security;
alter table public.competition_result_entries enable row level security;
alter table public.competition_calculated_results enable row level security;
alter table public.competition_live_state enable row level security;

create policy "competition_formats_visible"
  on public.competition_formats for select
  using (
    created_by = auth.uid()
    or (is_system = true and status = 'published')
    or public.user_role() = 'admin'
  );

create policy "competition_formats_owner_insert"
  on public.competition_formats for insert
  with check (
    public.user_role() in ('organizer', 'organizer_trainer', 'admin')
    and (
      (created_by = auth.uid() and is_system = false)
      or public.user_role() = 'admin'
    )
  );

create policy "competition_formats_owner_update_draft"
  on public.competition_formats for update
  using (
    (created_by = auth.uid() and status = 'draft' and is_system = false)
    or public.user_role() = 'admin'
  )
  with check (
    (created_by = auth.uid() and is_system = false)
    or public.user_role() = 'admin'
  );

create policy "competition_formats_owner_delete_draft"
  on public.competition_formats for delete
  using (
    (created_by = auth.uid() and status = 'draft' and is_system = false)
    or public.user_role() = 'admin'
  );

create policy "competition_entries_public_or_manager_read"
  on public.competition_result_entries for select
  using (
    public.are_event_results_public(event_id)
    or public.is_event_manager(event_id)
  );

create policy "competition_entries_manager_insert"
  on public.competition_result_entries for insert
  with check (
    public.is_event_manager(event_id)
    and recorded_by = auth.uid()
  );

create policy "competition_entries_manager_update"
  on public.competition_result_entries for update
  using (public.is_event_manager(event_id))
  with check (
    public.is_event_manager(event_id)
    and recorded_by = auth.uid()
  );

create policy "competition_entries_manager_delete"
  on public.competition_result_entries for delete
  using (public.is_event_manager(event_id));

create policy "competition_calculated_public_or_manager_read"
  on public.competition_calculated_results for select
  using (
    public.are_event_results_public(event_id)
    or public.is_event_manager(event_id)
  );

create policy "competition_calculated_manager_insert"
  on public.competition_calculated_results for insert
  with check (public.is_event_manager(event_id));

create policy "competition_calculated_manager_update"
  on public.competition_calculated_results for update
  using (public.is_event_manager(event_id))
  with check (public.is_event_manager(event_id));

create policy "competition_calculated_manager_delete"
  on public.competition_calculated_results for delete
  using (public.is_event_manager(event_id));

create policy "competition_live_public_or_manager_read"
  on public.competition_live_state for select
  using (
    public.are_event_results_public(event_id)
    or public.is_event_manager(event_id)
  );

create policy "competition_live_manager_insert"
  on public.competition_live_state for insert
  with check (
    public.is_event_manager(event_id)
    and updated_by = auth.uid()
  );

create policy "competition_live_manager_update"
  on public.competition_live_state for update
  using (public.is_event_manager(event_id))
  with check (
    public.is_event_manager(event_id)
    and updated_by = auth.uid()
  );

create policy "competition_live_manager_delete"
  on public.competition_live_state for delete
  using (public.is_event_manager(event_id));

revoke all on table public.competition_formats from anon;
revoke all on table public.competition_result_entries from anon;
revoke all on table public.competition_calculated_results from anon;
revoke all on table public.competition_live_state from anon;

grant select on table public.competition_formats to anon;
grant select on table public.competition_result_entries to anon;
grant select on table public.competition_calculated_results to anon;
grant select on table public.competition_live_state to anon;

grant select, insert, update, delete on table public.competition_formats to authenticated;
grant select, insert, update, delete on table public.competition_result_entries to authenticated;
grant select, insert, update, delete on table public.competition_calculated_results to authenticated;
grant select, insert, update, delete on table public.competition_live_state to authenticated;

grant all on table public.competition_formats to service_role;
grant all on table public.competition_result_entries to service_role;
grant all on table public.competition_calculated_results to service_role;
grant all on table public.competition_live_state to service_role;

alter publication supabase_realtime add table public.competition_calculated_results;
alter publication supabase_realtime add table public.competition_live_state;

-- ============================================================================
-- Source migration: 20260729150000_add_event_creator_tutorial_seen.sql
-- ============================================================================

-- Additive account preference used by the event creator onboarding.
-- Existing profiles remain unchanged (NULL means the tutorial has not been seen).
alter table public.profiles
  add column if not exists event_creator_tutorial_seen_at timestamptz;

-- ============================================================================
-- Source migration: 20260730120000_fix_profile_update_privileges.sql
-- ============================================================================

-- Profiles use column-level UPDATE grants so authenticated users can edit only
-- safe account fields. Re-applying this grant is idempotent and changes no data.
grant update (full_name, company, event_creator_tutorial_seen_at)
  on table public.profiles
  to authenticated;

-- ============================================================================
-- Source migration: 20260730150000_allow_safe_competition_format_archiving.sql
-- ============================================================================

-- Published competition format definitions remain immutable, but their lifecycle
-- status may change from published to archived when the API confirms that no
-- event references the version.

create or replace function public.prevent_published_competition_format_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'published'
    and new.status not in ('published', 'archived')
  then
    raise exception 'Published competition format versions may only be archived';
  end if;

  if old.status = 'archived'
    and new.status is distinct from old.status
  then
    raise exception 'Archived competition format versions cannot be restored or edited';
  end if;

  if old.status = 'published'
    and new.status = 'archived'
    and exists (
      select 1
      from public.events
      where competition_format_id = old.id
    )
  then
    raise exception 'Competition format versions used by events cannot be archived';
  end if;

  if old.status in ('published', 'archived')
    and (
      new.definition is distinct from old.definition
      or new.name is distinct from old.name
      or new.description is distinct from old.description
      or new.family_id is distinct from old.family_id
      or new.version is distinct from old.version
      or new.previous_version_id is distinct from old.previous_version_id
      or new.created_by is distinct from old.created_by
      or new.is_system is distinct from old.is_system
      or new.published_at is distinct from old.published_at
      or new.created_at is distinct from old.created_at
    )
  then
    raise exception 'Published competition format versions are immutable';
  end if;

  return new;
end;
$$;

drop policy if exists "competition_formats_owner_update_draft"
  on public.competition_formats;
drop policy if exists "competition_formats_owner_update"
  on public.competition_formats;

create policy "competition_formats_owner_update"
  on public.competition_formats for update
  using (
    (created_by = auth.uid() and is_system = false)
    or public.user_role() = 'admin'
  )
  with check (
    (created_by = auth.uid() and is_system = false)
    or public.user_role() = 'admin'
  );

revoke all on function public.prevent_published_competition_format_change() from public;

-- ============================================================================
-- Source migration: 20260731120000_complete_training_p0.sql
-- ============================================================================

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

-- ============================================================================
-- Source migration: 20260731123000_fix_training_p0_service_grants.sql
-- ============================================================================

-- The production snapshot granted service_role only maintenance privileges on
-- dogs. Training booking hydration and deterministic dev seeding require the
-- server-side role to read and manage dog records.

grant all on table public.dogs to service_role;

-- ============================================================================
-- Source migration: 20260731124000_fix_availability_upsert_conflict.sql
-- ============================================================================

-- Let idempotent inserts reach the exact-slot unique index. PostgreSQL checks
-- BEFORE triggers before resolving ON CONFLICT, so the overlap trigger must
-- ignore an already existing identical interval.

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

  if tg_op = 'INSERT' and exists (
    select 1
    from public.trainer_date_availability slot
    where slot.trainer_id = new.trainer_id
      and slot.available_date = new.available_date
      and slot.start_time = new.start_time
      and slot.end_time = new.end_time
      and slot.is_active = new.is_active
  ) then
    return new;
  end if;

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

-- ============================================================================
-- Source migration: 20260731130000_complete_training_p1.sql
-- ============================================================================

-- P1: cancellation policy, reliable reminders, reviews and trainer analytics data.

alter table public.trainer_profiles
  add column if not exists cancellation_buffer_hours integer not null default 24;

alter table public.trainer_profiles
  drop constraint if exists trainer_profiles_cancellation_buffer_hours_check;
alter table public.trainer_profiles
  add constraint trainer_profiles_cancellation_buffer_hours_check
  check (cancellation_buffer_hours between 0 and 168);

alter table public.training_bookings
  add column if not exists reminder_sent_at timestamptz;

create index if not exists idx_training_bookings_reminder_due
  on public.training_bookings(scheduled_at)
  where status = 'confirmed' and reminder_sent_at is null;

create table if not exists public.training_reviews (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.training_bookings(id) on delete cascade,
  trainer_id uuid not null references auth.users(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  author_name text not null default 'Użytkownik',
  rating integer not null check (rating between 1 and 5),
  comment text check (comment is null or char_length(comment) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_training_reviews_trainer_created
  on public.training_reviews(trainer_id, created_at desc);
create index if not exists idx_training_reviews_user
  on public.training_reviews(user_id);

alter table public.training_reviews enable row level security;

drop policy if exists "training_reviews_select_public" on public.training_reviews;
create policy "training_reviews_select_public"
  on public.training_reviews
  for select
  using (
    auth.uid() = user_id
    or auth.uid() = trainer_id
    or exists (
      select 1
      from public.trainer_profiles profile
      where profile.trainer_id = training_reviews.trainer_id
        and profile.is_active
    )
  );

drop policy if exists "training_reviews_insert_completed_own" on public.training_reviews;
create policy "training_reviews_insert_completed_own"
  on public.training_reviews
  for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.training_bookings booking
      join public.training_types training_type
        on training_type.id = booking.training_type_id
      where booking.id = training_reviews.booking_id
        and booking.user_id = auth.uid()
        and booking.status = 'completed'
        and training_type.trainer_id = training_reviews.trainer_id
    )
  );

drop policy if exists "training_reviews_update_own" on public.training_reviews;
create policy "training_reviews_update_own"
  on public.training_reviews
  for update
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.training_bookings booking
      join public.training_types training_type
        on training_type.id = booking.training_type_id
      where booking.id = training_reviews.booking_id
        and booking.user_id = auth.uid()
        and booking.status = 'completed'
        and training_type.trainer_id = training_reviews.trainer_id
    )
  );

drop policy if exists "training_reviews_delete_own" on public.training_reviews;
create policy "training_reviews_delete_own"
  on public.training_reviews
  for delete
  using (auth.uid() = user_id);

grant all on public.training_reviews to service_role;
grant select, insert, update, delete on public.training_reviews to authenticated;
grant select on public.training_reviews to anon;

create or replace function public.claim_training_reminders(
  window_start timestamptz,
  window_end timestamptz,
  batch_size integer default 100
)
returns table (
  booking_id uuid,
  claimed_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if window_end <= window_start then
    raise exception using errcode = '22023', message = 'invalid_reminder_window';
  end if;

  return query
  with due as (
    select booking.id
    from public.training_bookings booking
    where booking.status = 'confirmed'
      and booking.reminder_sent_at is null
      and booking.scheduled_at >= window_start
      and booking.scheduled_at < window_end
    order by booking.scheduled_at
    for update skip locked
    limit least(greatest(batch_size, 1), 500)
  ),
  claimed as (
    update public.training_bookings booking
    set reminder_sent_at = now(),
        updated_at = now()
    from due
    where booking.id = due.id
    returning booking.id, booking.reminder_sent_at
  )
  select claimed.id, claimed.reminder_sent_at
  from claimed;
end;
$$;

create or replace function public.release_training_reminder_claim(
  target_booking_id uuid,
  target_claimed_at timestamptz
)
returns boolean
language sql
security definer
set search_path = ''
as $$
  with released as (
    update public.training_bookings
    set reminder_sent_at = null,
        updated_at = now()
    where id = target_booking_id
      and reminder_sent_at = target_claimed_at
    returning id
  )
  select exists(select 1 from released);
$$;

revoke all on function public.claim_training_reminders(timestamptz, timestamptz, integer) from public;
revoke all on function public.release_training_reminder_claim(uuid, timestamptz) from public;
grant execute on function public.claim_training_reminders(timestamptz, timestamptz, integer) to service_role;
grant execute on function public.release_training_reminder_claim(uuid, timestamptz) to service_role;

-- ============================================================================
-- Source migration: 20260731203000_add_event_payments_p0.sql
-- ============================================================================

alter table public.events
  add column if not exists pricing_mode text not null default 'free',
  add column if not exists date_prices jsonb not null default '{}'::jsonb,
  add column if not exists currency text not null default 'PLN';

alter table public.events
  drop constraint if exists events_pricing_mode_check;
alter table public.events
  add constraint events_pricing_mode_check
  check (pricing_mode in ('free', 'flat', 'per_date'));

alter table public.events
  drop constraint if exists events_currency_check;
alter table public.events
  add constraint events_currency_check
  check (currency ~ '^[A-Z]{3}$');

alter table public.registrations
  add column if not exists payment_expires_at timestamptz,
  add column if not exists approved_at timestamptz;

create table if not exists public.event_registration_items (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null references public.registrations(id) on delete cascade,
  item_key text not null,
  kind text not null check (kind in ('entry', 'date')),
  form_field_id text,
  occurrence_date date,
  label text not null,
  amount numeric(10, 2) not null check (amount > 0),
  currency text not null default 'PLN' check (currency ~ '^[A-Z]{3}$'),
  status text not null default 'pending_approval'
    check (status in ('pending_approval', 'pending_payment', 'paid', 'cancelled', 'refunded')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (registration_id, item_key)
);

create table if not exists public.event_payments (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null references public.registrations(id) on delete cascade,
  payee_user_id uuid not null references auth.users(id) on delete restrict,
  payer_user_id uuid references auth.users(id) on delete set null,
  payer_email text not null,
  amount numeric(10, 2) not null check (amount > 0),
  currency text not null default 'PLN' check (currency ~ '^[A-Z]{3}$'),
  status text not null default 'pending'
    check (status in ('pending', 'completed', 'failed', 'partially_refunded', 'refunded')),
  stripe_session_id text,
  stripe_payment_intent_id text,
  stripe_account_id text not null,
  checkout_token uuid not null default gen_random_uuid(),
  checkout_url text,
  expires_at timestamptz,
  confirmation_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.event_payment_items (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.event_payments(id) on delete cascade,
  registration_item_id uuid not null references public.event_registration_items(id) on delete restrict,
  amount numeric(10, 2) not null check (amount > 0),
  refunded_amount numeric(10, 2) not null default 0 check (refunded_amount >= 0 and refunded_amount <= amount),
  created_at timestamptz not null default now(),
  unique (payment_id, registration_item_id)
);

create unique index if not exists event_payments_checkout_token_key
  on public.event_payments(checkout_token);
create unique index if not exists event_payments_stripe_session_key
  on public.event_payments(stripe_session_id)
  where stripe_session_id is not null;
create unique index if not exists event_payments_stripe_payment_intent_key
  on public.event_payments(stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;
create index if not exists idx_event_registration_items_registration
  on public.event_registration_items(registration_id);
create index if not exists idx_event_payments_registration
  on public.event_payments(registration_id, created_at desc);
create index if not exists idx_event_payments_payee
  on public.event_payments(payee_user_id, created_at desc);

alter table public.event_registration_items enable row level security;
alter table public.event_payments enable row level security;
alter table public.event_payment_items enable row level security;

create policy "event_registration_items_owner_or_manager_read"
  on public.event_registration_items for select to authenticated
  using (
    exists (
      select 1
      from public.registrations registration
      where registration.id = event_registration_items.registration_id
        and (
          public.is_participant_owner(registration.participant_id)
          or public.is_event_manager(registration.event_id)
        )
    )
  );

create policy "event_payments_owner_or_manager_read"
  on public.event_payments for select to authenticated
  using (
    payer_user_id = auth.uid()
    or payee_user_id = auth.uid()
    or exists (
      select 1
      from public.registrations registration
      where registration.id = event_payments.registration_id
        and (
          public.is_participant_owner(registration.participant_id)
          or public.is_event_manager(registration.event_id)
        )
    )
  );

create policy "event_payment_items_owner_or_manager_read"
  on public.event_payment_items for select to authenticated
  using (
    exists (
      select 1
      from public.event_payments payment
      where payment.id = event_payment_items.payment_id
        and (
          payment.payer_user_id = auth.uid()
          or payment.payee_user_id = auth.uid()
          or exists (
            select 1
            from public.registrations registration
            where registration.id = payment.registration_id
              and (
                public.is_participant_owner(registration.participant_id)
                or public.is_event_manager(registration.event_id)
              )
          )
        )
    )
  );

grant select on public.event_registration_items to authenticated;
grant select on public.event_payments to authenticated;
grant select on public.event_payment_items to authenticated;
grant all on public.event_registration_items to service_role;
grant all on public.event_payments to service_role;
grant all on public.event_payment_items to service_role;

create or replace function public.complete_event_checkout(
  target_payment_id uuid,
  target_session_id text,
  target_payment_intent_id text
)
returns table (registration_id uuid, notification_required boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_payment public.event_payments%rowtype;
  should_notify boolean := false;
begin
  select * into current_payment
  from public.event_payments
  where id = target_payment_id
  for update;

  if current_payment.id is null then
    raise exception using message = 'event_payment_not_found';
  end if;
  if current_payment.stripe_session_id is not null
    and current_payment.stripe_session_id <> target_session_id then
    raise exception using message = 'event_payment_session_mismatch';
  end if;
  if current_payment.status not in ('pending', 'completed') then
    raise exception using message = 'event_payment_invalid_state';
  end if;

  should_notify := current_payment.status = 'pending';

  update public.event_payments
  set status = 'completed',
      stripe_session_id = target_session_id,
      stripe_payment_intent_id = target_payment_intent_id,
      expires_at = null,
      updated_at = now()
  where id = target_payment_id;

  update public.event_registration_items item
  set status = 'paid', updated_at = now()
  from public.event_payment_items payment_item
  where payment_item.payment_id = target_payment_id
    and payment_item.registration_item_id = item.id
    and item.status in ('pending_approval', 'pending_payment', 'paid');

  update public.registrations
  set status = 'confirmed',
      payment_expires_at = null,
      approved_at = coalesce(approved_at, now())
  where id = current_payment.registration_id
    and status = 'pending';

  return query select current_payment.registration_id, should_notify;
end;
$$;

create or replace function public.fail_event_checkout(
  target_payment_id uuid,
  target_session_id text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  current_payment public.event_payments%rowtype;
begin
  select * into current_payment
  from public.event_payments
  where id = target_payment_id
  for update;

  if current_payment.id is null then return false; end if;
  if current_payment.stripe_session_id is not null
    and current_payment.stripe_session_id <> target_session_id then
    return false;
  end if;
  if current_payment.status <> 'pending' then return false; end if;

  update public.event_payments
  set status = 'failed', expires_at = null, updated_at = now()
  where id = target_payment_id;

  update public.event_registration_items item
  set status = 'cancelled', updated_at = now()
  from public.event_payment_items payment_item
  where payment_item.payment_id = target_payment_id
    and payment_item.registration_item_id = item.id
    and item.status in ('pending_approval', 'pending_payment');

  update public.registrations
  set status = 'cancelled', payment_expires_at = null
  where id = current_payment.registration_id
    and status = 'pending';

  return true;
end;
$$;

revoke all on function public.complete_event_checkout(uuid, text, text) from public, anon, authenticated;
revoke all on function public.fail_event_checkout(uuid, text) from public, anon, authenticated;
grant execute on function public.complete_event_checkout(uuid, text, text) to service_role;
grant execute on function public.fail_event_checkout(uuid, text) to service_role;

-- ============================================================================
-- Source migration: 20260731213000_harden_event_payments_p0.sql
-- ============================================================================

create unique index if not exists event_payments_one_active_per_registration
  on public.event_payments(registration_id)
  where status in ('pending', 'completed', 'partially_refunded', 'refunded');

-- ============================================================================
-- Source migration: 20260731220000_add_event_payment_p1_p2.sql
-- ============================================================================

alter table public.event_payments
  add column if not exists refunded_amount numeric(10, 2) not null default 0 check (refunded_amount >= 0 and refunded_amount <= amount),
  add column if not exists stripe_charge_id text,
  add column if not exists receipt_url text,
  add column if not exists failure_code text,
  add column if not exists failure_message text,
  add column if not exists last_reconciled_at timestamptz,
  add column if not exists reconciliation_status text not null default 'not_checked'
    check (reconciliation_status in ('not_checked', 'ok', 'attention', 'error')),
  add column if not exists reconciliation_error text;

create table if not exists public.event_refunds (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.event_payments(id) on delete restrict,
  registration_id uuid not null references public.registrations(id) on delete restrict,
  requested_by uuid references auth.users(id) on delete set null,
  cancellation_request_id uuid references public.cancellation_requests(id) on delete set null,
  amount numeric(10, 2) not null check (amount > 0),
  currency text not null default 'PLN' check (currency ~ '^[A-Z]{3}$'),
  status text not null default 'pending'
    check (status in ('pending', 'requires_action', 'succeeded', 'failed', 'canceled')),
  stripe_refund_id text,
  requested_dates jsonb,
  new_form_data jsonb not null default '{}'::jsonb,
  cancel_registration boolean not null default false,
  reason text not null default 'requested_by_customer',
  error_code text,
  error_message text,
  notification_sent_at timestamptz,
  failure_notification_sent_at timestamptz,
  attempt_count integer not null default 1 check (attempt_count > 0),
  last_reconciled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.event_refund_attempts (
  id uuid primary key default gen_random_uuid(),
  refund_id uuid not null references public.event_refunds(id) on delete cascade,
  attempt_number integer not null check (attempt_number > 0),
  stripe_refund_id text,
  status text not null default 'pending',
  error_code text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (refund_id, attempt_number),
  unique (stripe_refund_id)
);

create table if not exists public.event_refund_items (
  id uuid primary key default gen_random_uuid(),
  refund_id uuid not null references public.event_refunds(id) on delete cascade,
  payment_item_id uuid not null references public.event_payment_items(id) on delete restrict,
  amount numeric(10, 2) not null check (amount > 0),
  created_at timestamptz not null default now(),
  unique (refund_id, payment_item_id),
  unique (payment_item_id)
);

create unique index if not exists event_refunds_stripe_refund_key
  on public.event_refunds(stripe_refund_id) where stripe_refund_id is not null;
create unique index if not exists event_refunds_cancellation_request_key
  on public.event_refunds(cancellation_request_id) where cancellation_request_id is not null;
create index if not exists idx_event_refunds_payment on public.event_refunds(payment_id, created_at desc);
create index if not exists idx_event_refunds_status on public.event_refunds(status, created_at);

alter table public.event_refunds enable row level security;
alter table public.event_refund_items enable row level security;
alter table public.event_refund_attempts enable row level security;

create policy "event_refunds_owner_or_manager_read"
  on public.event_refunds for select to authenticated
  using (
    exists (
      select 1 from public.event_payments payment
      where payment.id = event_refunds.payment_id
        and (
          payment.payer_user_id = auth.uid()
          or payment.payee_user_id = auth.uid()
          or exists (
            select 1 from public.registrations registration
            where registration.id = payment.registration_id
              and (public.is_participant_owner(registration.participant_id) or public.is_event_manager(registration.event_id))
          )
        )
    )
  );

create policy "event_refund_items_owner_or_manager_read"
  on public.event_refund_items for select to authenticated
  using (
    exists (
      select 1 from public.event_refunds refund
      join public.event_payments payment on payment.id = refund.payment_id
      where refund.id = event_refund_items.refund_id
        and (
          payment.payer_user_id = auth.uid()
          or payment.payee_user_id = auth.uid()
          or exists (
            select 1 from public.registrations registration
            where registration.id = payment.registration_id
              and (public.is_participant_owner(registration.participant_id) or public.is_event_manager(registration.event_id))
          )
        )
    )
  );

create policy "event_refund_attempts_owner_or_manager_read"
  on public.event_refund_attempts for select to authenticated
  using (exists (
    select 1 from public.event_refunds refund
    join public.event_payments payment on payment.id = refund.payment_id
    where refund.id = event_refund_attempts.refund_id
      and (payment.payer_user_id = auth.uid() or payment.payee_user_id = auth.uid())
  ));

grant select on public.event_refunds, public.event_refund_items, public.event_refund_attempts to authenticated;
grant all on public.event_refunds, public.event_refund_items, public.event_refund_attempts to service_role;

create or replace function public.complete_event_refund(target_refund_id uuid, target_stripe_refund_id text)
returns table (registration_id uuid, payment_id uuid, notification_required boolean)
language plpgsql security definer set search_path = public
as $$
declare
  current_refund public.event_refunds%rowtype;
  current_payment public.event_payments%rowtype;
  should_notify boolean := false;
  refunded_total numeric(10, 2);
begin
  select * into current_refund from public.event_refunds where id = target_refund_id for update;
  if current_refund.id is null then raise exception using message = 'event_refund_not_found'; end if;
  if current_refund.stripe_refund_id is not null and current_refund.stripe_refund_id <> target_stripe_refund_id then
    raise exception using message = 'event_refund_id_mismatch';
  end if;
  if current_refund.status not in ('pending', 'requires_action', 'succeeded') then
    raise exception using message = 'event_refund_invalid_state';
  end if;
  should_notify := current_refund.status <> 'succeeded';

  select * into current_payment from public.event_payments where id = current_refund.payment_id for update;
  update public.event_refunds set status = 'succeeded', stripe_refund_id = target_stripe_refund_id,
    error_code = null, error_message = null, last_reconciled_at = now(), updated_at = now()
  where id = target_refund_id;

  update public.event_payment_items payment_item
  set refunded_amount = least(payment_item.amount, payment_item.refunded_amount + refund_item.amount)
  from public.event_refund_items refund_item
  where refund_item.refund_id = target_refund_id and refund_item.payment_item_id = payment_item.id;

  update public.event_registration_items registration_item
  set status = 'refunded', updated_at = now()
  from public.event_payment_items payment_item, public.event_refund_items refund_item
  where refund_item.refund_id = target_refund_id
    and refund_item.payment_item_id = payment_item.id
    and payment_item.registration_item_id = registration_item.id
    and payment_item.refunded_amount >= payment_item.amount;

  select coalesce(sum(amount), 0) into refunded_total
  from public.event_refunds where payment_id = current_refund.payment_id and status = 'succeeded';
  update public.event_payments
  set refunded_amount = least(amount, refunded_total),
      status = case when refunded_total >= amount then 'refunded' else 'partially_refunded' end,
      reconciliation_status = 'ok', reconciliation_error = null, last_reconciled_at = now(), updated_at = now()
  where id = current_refund.payment_id;

  update public.registrations
  set form_data = current_refund.new_form_data,
      status = case when current_refund.cancel_registration then 'cancelled' else 'confirmed' end
  where id = current_refund.registration_id;

  if current_refund.cancellation_request_id is not null then
    update public.cancellation_requests
    set status = 'accepted', processed_at = now(), processed_by = coalesce(processed_by, current_refund.requested_by)
    where id = current_refund.cancellation_request_id and status = 'pending';
  end if;
  return query select current_refund.registration_id, current_refund.payment_id, should_notify;
end;
$$;

create or replace function public.fail_event_refund(
  target_refund_id uuid, target_stripe_refund_id text, target_status text,
  target_error_code text default null, target_error_message text default null
)
returns boolean language plpgsql security definer set search_path = public
as $$
begin
  if target_status not in ('failed', 'canceled', 'requires_action', 'pending') then return false; end if;
  update public.event_refunds
  set status = target_status,
      stripe_refund_id = coalesce(stripe_refund_id, target_stripe_refund_id),
      error_code = target_error_code, error_message = target_error_message,
      last_reconciled_at = now(), updated_at = now()
  where id = target_refund_id and status <> 'succeeded'
    and (stripe_refund_id is null or stripe_refund_id = target_stripe_refund_id);
  return found;
end;
$$;

revoke all on function public.complete_event_refund(uuid, text) from public, anon, authenticated;
revoke all on function public.fail_event_refund(uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.complete_event_refund(uuid, text) to service_role;
grant execute on function public.fail_event_refund(uuid, text, text, text, text) to service_role;

-- ============================================================================
-- Source migration: 20260731224000_fix_event_refund_rpc_ambiguity.sql
-- ============================================================================

create or replace function public.complete_event_refund(target_refund_id uuid, target_stripe_refund_id text)
returns table (registration_id uuid, payment_id uuid, notification_required boolean)
language plpgsql security definer set search_path = public
as $$
declare
  current_refund public.event_refunds%rowtype;
  current_payment public.event_payments%rowtype;
  should_notify boolean := false;
  refunded_total numeric(10, 2);
begin
  select * into current_refund from public.event_refunds where id = target_refund_id for update;
  if current_refund.id is null then raise exception using message = 'event_refund_not_found'; end if;
  if current_refund.stripe_refund_id is not null and current_refund.stripe_refund_id <> target_stripe_refund_id then
    raise exception using message = 'event_refund_id_mismatch';
  end if;
  if current_refund.status not in ('pending', 'requires_action', 'succeeded') then
    raise exception using message = 'event_refund_invalid_state';
  end if;
  if current_refund.status = 'succeeded' then
    return query select current_refund.registration_id, current_refund.payment_id, false;
    return;
  end if;
  should_notify := true;

  select * into current_payment from public.event_payments where id = current_refund.payment_id for update;
  update public.event_refunds set status = 'succeeded', stripe_refund_id = target_stripe_refund_id,
    error_code = null, error_message = null, last_reconciled_at = now(), updated_at = now()
  where id = target_refund_id;

  update public.event_payment_items payment_item
  set refunded_amount = least(payment_item.amount, payment_item.refunded_amount + refund_item.amount)
  from public.event_refund_items refund_item
  where refund_item.refund_id = target_refund_id and refund_item.payment_item_id = payment_item.id;

  update public.event_registration_items registration_item
  set status = 'refunded', updated_at = now()
  from public.event_payment_items payment_item, public.event_refund_items refund_item
  where refund_item.refund_id = target_refund_id
    and refund_item.payment_item_id = payment_item.id
    and payment_item.registration_item_id = registration_item.id
    and payment_item.refunded_amount >= payment_item.amount;

  select coalesce(sum(refund_row.amount), 0) into refunded_total
  from public.event_refunds refund_row
  where refund_row.payment_id = current_refund.payment_id and refund_row.status = 'succeeded';
  update public.event_payments
  set refunded_amount = least(amount, refunded_total),
      status = case when refunded_total >= amount then 'refunded' else 'partially_refunded' end,
      reconciliation_status = 'ok', reconciliation_error = null, last_reconciled_at = now(), updated_at = now()
  where id = current_refund.payment_id;

  update public.registrations
  set form_data = current_refund.new_form_data,
      status = case when current_refund.cancel_registration then 'cancelled' else 'confirmed' end
  where id = current_refund.registration_id;

  if current_refund.cancellation_request_id is not null then
    update public.cancellation_requests
    set status = 'accepted', processed_at = now(), processed_by = coalesce(processed_by, current_refund.requested_by)
    where id = current_refund.cancellation_request_id and status = 'pending';
  end if;
  return query select current_refund.registration_id, current_refund.payment_id, should_notify;
end;
$$;

revoke all on function public.complete_event_refund(uuid, text) from public, anon, authenticated;
grant execute on function public.complete_event_refund(uuid, text) to service_role;

-- ============================================================================
-- Source migration: 20260801110000_fix_paid_event_refund_schedule.sql
-- ============================================================================

-- Paid event refunds update registrations atomically. Keep schedule assignments
-- in the same transaction so a refunded/cancelled participant cannot remain in
-- the organizer's schedule or retain access through a stale assignment.

create or replace function public.complete_event_refund(target_refund_id uuid, target_stripe_refund_id text)
returns table (registration_id uuid, payment_id uuid, notification_required boolean)
language plpgsql security definer set search_path = public
as $$
declare
  current_refund public.event_refunds%rowtype;
  current_payment public.event_payments%rowtype;
  should_notify boolean := false;
  refunded_total numeric(10, 2);
  refunded_dates text[] := array[]::text[];
begin
  select * into current_refund from public.event_refunds where id = target_refund_id for update;
  if current_refund.id is null then raise exception using message = 'event_refund_not_found'; end if;
  if current_refund.stripe_refund_id is not null and current_refund.stripe_refund_id <> target_stripe_refund_id then
    raise exception using message = 'event_refund_id_mismatch';
  end if;
  if current_refund.status not in ('pending', 'requires_action', 'succeeded') then
    raise exception using message = 'event_refund_invalid_state';
  end if;

  if current_refund.requested_dates is not null then
    select coalesce(array_agg(date_value), array[]::text[])
    into refunded_dates
    from jsonb_array_elements_text(current_refund.requested_dates) as refunded_date(date_value);
  end if;

  if current_refund.cancel_registration then
    delete from public.schedule_assignments assignment
    where assignment.registration_id = current_refund.registration_id;
  elsif cardinality(refunded_dates) > 0 then
    delete from public.schedule_assignments assignment
    using public.time_slots slot
    where assignment.registration_id = current_refund.registration_id
      and assignment.time_slot_id = slot.id
      and (
        assignment.item_date = any(refunded_dates)
        or slot.slot_date::text = any(refunded_dates)
      );
  end if;

  -- Stripe webhooks and reconciliation may replay the same successful refund.
  -- Schedule cleanup above remains idempotent, while financial amounts must not
  -- be applied twice.
  if current_refund.status = 'succeeded' then
    return query select current_refund.registration_id, current_refund.payment_id, false;
    return;
  end if;
  should_notify := true;

  select * into current_payment from public.event_payments where id = current_refund.payment_id for update;
  update public.event_refunds set status = 'succeeded', stripe_refund_id = target_stripe_refund_id,
    error_code = null, error_message = null, last_reconciled_at = now(), updated_at = now()
  where id = target_refund_id;

  update public.event_payment_items payment_item
  set refunded_amount = least(payment_item.amount, payment_item.refunded_amount + refund_item.amount)
  from public.event_refund_items refund_item
  where refund_item.refund_id = target_refund_id and refund_item.payment_item_id = payment_item.id;

  update public.event_registration_items registration_item
  set status = 'refunded', updated_at = now()
  from public.event_payment_items payment_item, public.event_refund_items refund_item
  where refund_item.refund_id = target_refund_id
    and refund_item.payment_item_id = payment_item.id
    and payment_item.registration_item_id = registration_item.id
    and payment_item.refunded_amount >= payment_item.amount;

  select coalesce(sum(refund_row.amount), 0) into refunded_total
  from public.event_refunds refund_row
  where refund_row.payment_id = current_refund.payment_id and refund_row.status = 'succeeded';
  update public.event_payments
  set refunded_amount = least(amount, refunded_total),
      status = case when refunded_total >= amount then 'refunded' else 'partially_refunded' end,
      reconciliation_status = 'ok', reconciliation_error = null, last_reconciled_at = now(), updated_at = now()
  where id = current_refund.payment_id;

  update public.registrations
  set form_data = current_refund.new_form_data,
      status = case when current_refund.cancel_registration then 'cancelled' else 'confirmed' end
  where id = current_refund.registration_id;

  if current_refund.cancellation_request_id is not null then
    update public.cancellation_requests
    set status = 'accepted', processed_at = now(), processed_by = coalesce(processed_by, current_refund.requested_by)
    where id = current_refund.cancellation_request_id and status = 'pending';
  end if;
  return query select current_refund.registration_id, current_refund.payment_id, should_notify;
end;
$$;

revoke all on function public.complete_event_refund(uuid, text) from public, anon, authenticated;
grant execute on function public.complete_event_refund(uuid, text) to service_role;

-- Repair artifacts created before the atomic cleanup was introduced.
delete from public.schedule_assignments assignment
using public.registrations registration
where assignment.registration_id = registration.id
  and registration.status = 'cancelled';

delete from public.schedule_assignments assignment
using public.registrations registration
where assignment.registration_id = registration.id
  and assignment.item_date <> ''
  and not exists (
    select 1
    from jsonb_each(coalesce(registration.form_data, '{}'::jsonb)) field
    cross join lateral jsonb_array_elements_text(
      case when jsonb_typeof(field.value) = 'array' then field.value else '[]'::jsonb end
    ) selected_date
    where selected_date.value = assignment.item_date
  );

-- ============================================================================
-- Source migration: 20260803143000_add_registration_notifications_and_organizer_reviews.sql
-- ============================================================================

-- Registration opening notifications and public organizer reputation.

alter table public.events
  add column if not exists registration_opens_at timestamptz;

alter table public.events
  drop constraint if exists events_registration_window_check;
alter table public.events
  add constraint events_registration_window_check check (
    registration_opens_at is null
    or registration_deadline is null
    or registration_opens_at < registration_deadline
  );

create index if not exists idx_events_registration_opens_at
  on public.events(registration_opens_at)
  where registration_opens_at is not null and status = 'upcoming';

create table if not exists public.event_registration_notifications (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  claimed_at timestamptz,
  notified_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  unique (event_id, user_id)
);

create index if not exists idx_event_registration_notifications_pending
  on public.event_registration_notifications(event_id, created_at)
  where notified_at is null;

alter table public.event_registration_notifications enable row level security;

drop policy if exists "event_registration_notifications_select_own" on public.event_registration_notifications;
create policy "event_registration_notifications_select_own"
  on public.event_registration_notifications for select
  using (auth.uid() = user_id);

drop policy if exists "event_registration_notifications_insert_own" on public.event_registration_notifications;
create policy "event_registration_notifications_insert_own"
  on public.event_registration_notifications for insert
  with check (
    auth.uid() = user_id
    and lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

drop policy if exists "event_registration_notifications_delete_own" on public.event_registration_notifications;
create policy "event_registration_notifications_delete_own"
  on public.event_registration_notifications for delete
  using (auth.uid() = user_id);

grant select, insert, delete on public.event_registration_notifications to authenticated;
grant all on public.event_registration_notifications to service_role;

create table if not exists public.organizer_profiles (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null unique references auth.users(id) on delete cascade,
  slug text not null unique,
  display_name text not null,
  organization_name text,
  bio text,
  profile_image_url text,
  location_city text,
  website_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organizer_profiles_display_name_length check (char_length(display_name) between 1 and 120),
  constraint organizer_profiles_organization_name_length check (organization_name is null or char_length(organization_name) <= 160),
  constraint organizer_profiles_bio_length check (bio is null or char_length(bio) <= 5000),
  constraint organizer_profiles_location_city_length check (location_city is null or char_length(location_city) <= 120)
);

create index if not exists idx_organizer_profiles_active
  on public.organizer_profiles(is_active, display_name);

alter table public.organizer_profiles enable row level security;

drop policy if exists "organizer_profiles_select_public" on public.organizer_profiles;
create policy "organizer_profiles_select_public"
  on public.organizer_profiles for select
  using (is_active or auth.uid() = organizer_id);

drop policy if exists "organizer_profiles_insert_own" on public.organizer_profiles;
create policy "organizer_profiles_insert_own"
  on public.organizer_profiles for insert
  with check (
    auth.uid() = organizer_id
    and public.user_role() in ('organizer', 'organizer_trainer', 'admin')
  );

drop policy if exists "organizer_profiles_update_own" on public.organizer_profiles;
create policy "organizer_profiles_update_own"
  on public.organizer_profiles for update
  using (auth.uid() = organizer_id or public.user_role() = 'admin')
  with check (auth.uid() = organizer_id or public.user_role() = 'admin');

grant select on public.organizer_profiles to anon, authenticated;
grant insert, update on public.organizer_profiles to authenticated;
grant all on public.organizer_profiles to service_role;

create table if not exists public.event_reviews (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  organizer_id uuid not null references auth.users(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  author_name text not null,
  rating integer not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, user_id),
  constraint event_reviews_author_name_length check (char_length(author_name) between 1 and 120),
  constraint event_reviews_comment_length check (comment is null or char_length(comment) <= 2000)
);

create index if not exists idx_event_reviews_organizer_created
  on public.event_reviews(organizer_id, created_at desc);
create index if not exists idx_event_reviews_user
  on public.event_reviews(user_id, created_at desc);

alter table public.event_reviews enable row level security;

drop policy if exists "event_reviews_select_public" on public.event_reviews;
create policy "event_reviews_select_public"
  on public.event_reviews for select using (true);

drop policy if exists "event_reviews_update_own" on public.event_reviews;
create policy "event_reviews_update_own"
  on public.event_reviews for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "event_reviews_delete_own" on public.event_reviews;
create policy "event_reviews_delete_own"
  on public.event_reviews for delete
  using (auth.uid() = user_id);

grant select on public.event_reviews to anon, authenticated;
grant update, delete on public.event_reviews to authenticated;
grant all on public.event_reviews to service_role;

drop trigger if exists organizer_profiles_updated_at on public.organizer_profiles;
create trigger organizer_profiles_updated_at
  before update on public.organizer_profiles
  for each row execute function public.update_updated_at_column();

drop trigger if exists event_reviews_updated_at on public.event_reviews;
create trigger event_reviews_updated_at
  before update on public.event_reviews
  for each row execute function public.update_updated_at_column();

-- ============================================================================
-- Source migration: 20260803170000_schedule_registration_notifications.sql
-- ============================================================================

-- Run registration-opening notifications every five minutes from Supabase.
-- The target URL and bearer token are read at runtime from Supabase Vault, so
-- no environment-specific values or credentials are stored in migrations.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

create or replace function public.invoke_event_registration_notifications()
returns bigint
language plpgsql
security definer
set search_path = ''
as $function$
declare
  site_url text;
  cron_secret text;
  request_id bigint;
begin
  select decrypted_secret
  into site_url
  from vault.decrypted_secrets
  where name = 'dogdex_site_url';

  select decrypted_secret
  into cron_secret
  from vault.decrypted_secrets
  where name = 'dogdex_cron_secret';

  if nullif(trim(site_url), '') is null or nullif(trim(cron_secret), '') is null then
    raise warning 'Dogdex registration notification cron is not configured. Add dogdex_site_url and dogdex_cron_secret to Supabase Vault.';
    return null;
  end if;

  if trim(site_url) !~ '^https://[^/]+' then
    raise warning 'dogdex_site_url must be an HTTPS URL.';
    return null;
  end if;

  select net.http_post(
    url := rtrim(trim(site_url), '/') || '/api/event-registration-notifications',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || cron_secret,
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object('triggered_at', now()),
    timeout_milliseconds := 10000
  )
  into request_id;

  return request_id;
end;
$function$;

revoke all on function public.invoke_event_registration_notifications() from public;
revoke all on function public.invoke_event_registration_notifications() from anon;
revoke all on function public.invoke_event_registration_notifications() from authenticated;

select cron.schedule(
  'event-registration-notifications-every-5-minutes',
  '*/5 * * * *',
  $cron$select public.invoke_event_registration_notifications();$cron$
);

-- ============================================================================
-- Source migration: 20260804120000_add_event_waitlist_and_announcements.sql
-- ============================================================================

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

-- ============================================================================
-- Source migration: 20260804150000_add_review_safety.sql
-- ============================================================================

-- Verified reviews, owner responses, user reports and administrator moderation.
-- Also adds an atomic claim for announcement deliveries, preventing overlapping
-- cron and organizer requests from sending the same message concurrently.

alter table public.event_announcement_deliveries
  add column if not exists claimed_at timestamptz;

create index if not exists idx_event_announcement_deliveries_pending
  on public.event_announcement_deliveries(created_at, id)
  where status = 'pending';

create or replace function public.claim_event_announcement_deliveries(
  p_announcement_id uuid default null,
  p_limit integer default 100,
  p_stale_before timestamptz default now() - interval '30 minutes'
)
returns setof public.event_announcement_deliveries
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_limit < 1 or p_limit > 500 then
    raise exception 'invalid_announcement_delivery_limit';
  end if;

  return query
  with candidates as (
    select delivery.id
    from public.event_announcement_deliveries delivery
    where delivery.status = 'pending'
      and delivery.attempt_count < 3
      and (p_announcement_id is null or delivery.announcement_id = p_announcement_id)
      and (delivery.claimed_at is null or delivery.claimed_at < p_stale_before)
    order by delivery.created_at, delivery.id
    for update skip locked
    limit p_limit
  )
  update public.event_announcement_deliveries delivery
  set claimed_at = now(),
      attempt_count = delivery.attempt_count + 1,
      error = null
  from candidates
  where delivery.id = candidates.id
  returning delivery.*;
end;
$$;

revoke all on function public.claim_event_announcement_deliveries(uuid, integer, timestamptz)
  from public, anon, authenticated;
grant execute on function public.claim_event_announcement_deliveries(uuid, integer, timestamptz)
  to service_role;

alter table public.event_reviews
  add column if not exists is_verified boolean not null default true,
  add column if not exists moderation_status text not null default 'published',
  add column if not exists moderation_reason text,
  add column if not exists moderated_at timestamptz,
  add column if not exists moderated_by uuid references auth.users(id) on delete set null,
  add column if not exists response_text text,
  add column if not exists response_at timestamptz,
  add column if not exists response_by uuid references auth.users(id) on delete set null;

alter table public.event_reviews
  drop constraint if exists event_reviews_moderation_status_check,
  add constraint event_reviews_moderation_status_check
    check (moderation_status in ('published', 'hidden', 'removed')),
  drop constraint if exists event_reviews_response_length_check,
  add constraint event_reviews_response_length_check
    check (response_text is null or char_length(response_text) between 1 and 2000);

alter table public.training_reviews
  add column if not exists is_verified boolean not null default true,
  add column if not exists moderation_status text not null default 'published',
  add column if not exists moderation_reason text,
  add column if not exists moderated_at timestamptz,
  add column if not exists moderated_by uuid references auth.users(id) on delete set null,
  add column if not exists response_text text,
  add column if not exists response_at timestamptz,
  add column if not exists response_by uuid references auth.users(id) on delete set null;

alter table public.training_reviews
  drop constraint if exists training_reviews_moderation_status_check,
  add constraint training_reviews_moderation_status_check
    check (moderation_status in ('published', 'hidden', 'removed')),
  drop constraint if exists training_reviews_response_length_check,
  add constraint training_reviews_response_length_check
    check (response_text is null or char_length(response_text) between 1 and 2000);

drop policy if exists "event_reviews_select_public" on public.event_reviews;
create policy "event_reviews_select_public"
  on public.event_reviews for select
  using (
    moderation_status = 'published'
    or auth.uid() = user_id
    or auth.uid() = organizer_id
    or public.user_role() = 'admin'
  );

drop policy if exists "event_reviews_update_own" on public.event_reviews;
drop policy if exists "event_reviews_delete_own" on public.event_reviews;
revoke update, delete on public.event_reviews from authenticated;

drop policy if exists "training_reviews_select_public" on public.training_reviews;
create policy "training_reviews_select_public"
  on public.training_reviews for select
  using (
    (moderation_status = 'published' and exists (
      select 1 from public.trainer_profiles profile
      where profile.trainer_id = training_reviews.trainer_id and profile.is_active
    ))
    or auth.uid() = user_id
    or auth.uid() = trainer_id
    or public.user_role() = 'admin'
  );

drop policy if exists "training_reviews_insert_completed_own" on public.training_reviews;
drop policy if exists "training_reviews_update_own" on public.training_reviews;
drop policy if exists "training_reviews_delete_own" on public.training_reviews;
revoke insert, update, delete on public.training_reviews from authenticated;

create table if not exists public.review_reports (
  id uuid primary key default gen_random_uuid(),
  review_type text not null check (review_type in ('event', 'training')),
  review_id uuid not null,
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reason text not null check (reason in ('spam', 'offensive', 'privacy', 'conflict', 'other')),
  details text,
  status text not null default 'pending' check (status in ('pending', 'dismissed', 'actioned')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null,
  resolution_note text,
  unique (review_type, review_id, reporter_id),
  constraint review_reports_details_length check (details is null or char_length(details) <= 1000),
  constraint review_reports_resolution_note_length check (resolution_note is null or char_length(resolution_note) <= 1000)
);

create index if not exists idx_review_reports_pending
  on public.review_reports(created_at)
  where status = 'pending';

create or replace function public.validate_review_report_target()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  review_author uuid;
begin
  if new.review_type = 'event' then
    select user_id into review_author from public.event_reviews where id = new.review_id;
  else
    select user_id into review_author from public.training_reviews where id = new.review_id;
  end if;
  if review_author is null then
    raise exception 'Review does not exist';
  end if;
  if review_author = new.reporter_id then
    raise exception 'Review author cannot report own review';
  end if;
  return new;
end;
$$;

drop trigger if exists validate_review_report_target on public.review_reports;
create trigger validate_review_report_target
  before insert or update of review_type, review_id, reporter_id on public.review_reports
  for each row execute function public.validate_review_report_target();

alter table public.review_reports enable row level security;

drop policy if exists "review_reports_select_own_or_admin" on public.review_reports;
create policy "review_reports_select_own_or_admin"
  on public.review_reports for select
  using (auth.uid() = reporter_id or public.user_role() = 'admin');

drop policy if exists "review_reports_insert_own" on public.review_reports;
create policy "review_reports_insert_own"
  on public.review_reports for insert
  with check (auth.uid() = reporter_id);

grant select, insert on public.review_reports to authenticated;
grant all on public.review_reports to service_role;

create index if not exists idx_event_reviews_public
  on public.event_reviews(organizer_id, created_at desc)
  where moderation_status = 'published';
create index if not exists idx_training_reviews_public
  on public.training_reviews(trainer_id, created_at desc)
  where moderation_status = 'published';

-- ============================================================================
-- Source migration: 20260804180000_add_event_team_management.sql
-- ============================================================================

-- Event-scoped collaboration. The event creator remains the owner; invited
-- people receive only the operational permissions selected for this event.

create table if not exists public.event_team_members (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  email text not null,
  user_id uuid references auth.users(id) on delete set null,
  permissions text[] not null,
  status text not null default 'pending' check (status in ('pending', 'active')),
  invited_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_team_members_email_normalized check (email = lower(trim(email))),
  constraint event_team_members_permissions_valid check (
    cardinality(permissions) > 0
    and permissions <@ array['registrations', 'checkin', 'results', 'finance']::text[]
  ),
  unique (event_id, email)
);

create index if not exists idx_event_team_members_user
  on public.event_team_members(user_id, event_id);
create index if not exists idx_event_team_members_email
  on public.event_team_members(lower(email), event_id);

drop trigger if exists event_team_members_updated_at on public.event_team_members;
create trigger event_team_members_updated_at
  before update on public.event_team_members
  for each row execute function public.update_updated_at_column();

alter table public.event_team_members enable row level security;

-- Kept SECURITY DEFINER so it can safely be used from policies without RLS
-- recursion. A pending invitation is valid when the account uses the invited
-- email address; the application links user_id on the first authenticated use.
create or replace function public.event_team_has_permission(
  target_event_id uuid,
  required_permission text default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    public.user_role() = 'admin'
    or exists (
      select 1
      from public.events event
      where event.id = target_event_id
        and event.created_by = auth.uid()
    )
    or exists (
      select 1
      from public.event_team_members member
      where member.event_id = target_event_id
        and member.status in ('pending', 'active')
        and (
          member.user_id = auth.uid()
          or lower(member.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
        )
        and (
          required_permission is null
          or required_permission = any(member.permissions)
        )
    );
$$;

revoke all on function public.event_team_has_permission(uuid, text) from public;
grant execute on function public.event_team_has_permission(uuid, text) to authenticated, service_role;

create policy "event_team_members_owner_or_self_read"
  on public.event_team_members for select to authenticated
  using (
    public.event_team_has_permission(event_id, null)
    and (
      public.user_role() = 'admin'
      or exists (
        select 1 from public.events event
        where event.id = event_team_members.event_id and event.created_by = auth.uid()
      )
      or user_id = auth.uid()
      or lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
  );

grant select on public.event_team_members to authenticated;
grant all on public.event_team_members to service_role;

-- Read access for every operational role. Write access continues to go through
-- application routes, which validate the exact permission before using the
-- service-role client.
create policy "events_event_team_read" on public.events
  for select to authenticated using (public.event_team_has_permission(id, null));

create policy "registrations_event_team_read" on public.registrations
  for select to authenticated using (public.event_team_has_permission(event_id, null));

create policy "participants_event_team_read" on public.participants
  for select to authenticated using (
    exists (
      select 1 from public.registrations registration
      where registration.participant_id = participants.id
        and public.event_team_has_permission(registration.event_id, null)
    )
    or exists (
      select 1 from public.event_waitlist_entries waitlist
      where waitlist.participant_id = participants.id
        and public.event_team_has_permission(waitlist.event_id, null)
    )
  );

create policy "cancellation_requests_event_team_read" on public.cancellation_requests
  for select to authenticated using (public.event_team_has_permission(event_id, 'registrations'));

create policy "event_waitlist_event_team_read" on public.event_waitlist_entries
  for select to authenticated using (public.event_team_has_permission(event_id, 'registrations'));

create policy "event_announcements_event_team_read" on public.event_announcements
  for select to authenticated using (public.event_team_has_permission(event_id, 'registrations'));

create policy "event_announcement_deliveries_event_team_read" on public.event_announcement_deliveries
  for select to authenticated using (
    exists (
      select 1 from public.event_announcements announcement
      where announcement.id = event_announcement_deliveries.announcement_id
        and public.event_team_has_permission(announcement.event_id, 'registrations')
    )
  );

create policy "time_slots_event_team_read" on public.time_slots
  for select to authenticated using (
    public.event_team_has_permission(event_id, 'registrations')
    or public.event_team_has_permission(event_id, 'results')
  );

create policy "schedule_assignments_event_team_read" on public.schedule_assignments
  for select to authenticated using (
    exists (
      select 1 from public.registrations registration
      where registration.id = schedule_assignments.registration_id
        and (
          public.event_team_has_permission(registration.event_id, 'registrations')
          or public.event_team_has_permission(registration.event_id, 'results')
        )
    )
  );

create policy "results_event_team_read" on public.results
  for select to authenticated using (public.event_team_has_permission(event_id, 'results'));

create policy "competition_entries_event_team_read" on public.competition_result_entries
  for select to authenticated using (public.event_team_has_permission(event_id, 'results'));

create policy "competition_calculated_event_team_read" on public.competition_calculated_results
  for select to authenticated using (public.event_team_has_permission(event_id, 'results'));

create policy "competition_live_event_team_read" on public.competition_live_state
  for select to authenticated using (public.event_team_has_permission(event_id, 'results'));

create policy "event_registration_items_finance_team_read" on public.event_registration_items
  for select to authenticated using (
    exists (
      select 1 from public.registrations registration
      where registration.id = event_registration_items.registration_id
        and public.event_team_has_permission(registration.event_id, 'finance')
    )
  );

create policy "event_payments_finance_team_read" on public.event_payments
  for select to authenticated using (
    exists (
      select 1 from public.registrations registration
      where registration.id = event_payments.registration_id
        and public.event_team_has_permission(registration.event_id, 'finance')
    )
  );

create policy "event_payment_items_finance_team_read" on public.event_payment_items
  for select to authenticated using (
    exists (
      select 1
      from public.event_payments payment
      join public.registrations registration on registration.id = payment.registration_id
      where payment.id = event_payment_items.payment_id
        and public.event_team_has_permission(registration.event_id, 'finance')
    )
  );

create policy "event_refunds_finance_team_read" on public.event_refunds
  for select to authenticated using (
    exists (
      select 1 from public.registrations registration
      where registration.id = event_refunds.registration_id
        and public.event_team_has_permission(registration.event_id, 'finance')
    )
  );

create policy "event_refund_items_finance_team_read" on public.event_refund_items
  for select to authenticated using (
    exists (
      select 1
      from public.event_refunds refund
      join public.registrations registration on registration.id = refund.registration_id
      where refund.id = event_refund_items.refund_id
        and public.event_team_has_permission(registration.event_id, 'finance')
    )
  );

create policy "event_refund_attempts_finance_team_read" on public.event_refund_attempts
  for select to authenticated using (
    exists (
      select 1
      from public.event_refunds refund
      join public.registrations registration on registration.id = refund.registration_id
      where refund.id = event_refund_attempts.refund_id
        and public.event_team_has_permission(registration.event_id, 'finance')
    )
  );

commit;
