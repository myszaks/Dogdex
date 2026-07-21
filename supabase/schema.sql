-- ============================================================
-- Dogdex – Schemat bazy danych (Supabase / PostgreSQL)
-- Wklej całość do Supabase → SQL Editor → Run
-- ============================================================

-- Rozszerzenie UUID
create extension if not exists "uuid-ossp";

-- ============================================================
-- Tabele
-- ============================================================

create table if not exists events (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null,
  title       text not null,
  description text,
  start_at    timestamptz,
  end_at      timestamptz,
  registration_opens_at timestamptz,
  registration_deadline timestamptz,
  location    text,
  created_by  uuid,
  metadata    jsonb not null default '{}',
  status      text not null default 'upcoming'
                check (status in ('upcoming','ongoing','finished','cancelled')),
  image_url   text,
  created_at  timestamptz not null default now()
);

create table if not exists participants (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid,
  dog_name    text,
  dog_breed   text,
  owner_name  text,
  owner_email text,
  extra       jsonb not null default '{}'
);

create table if not exists registrations (
  id             uuid primary key default gen_random_uuid(),
  event_id       uuid not null references events(id) on delete cascade,
  participant_id uuid not null references participants(id) on delete cascade,
  status         text not null default 'pending'
                   check (status in ('pending','confirmed','cancelled')),
  created_at     timestamptz not null default now(),
  form_data      jsonb not null default '{}'
);

create table if not exists heats (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references events(id) on delete cascade,
  name        text,
  start_time  timestamptz,
  order_index integer not null default 0
);

create table if not exists results (
  id             uuid primary key default gen_random_uuid(),
  heat_id        uuid references heats(id) on delete set null,
  event_id       uuid references events(id) on delete cascade,
  participant_id uuid not null references participants(id) on delete cascade,
  time_ms        integer,
  rank           integer,
  notes          text,
  created_at     timestamptz not null default now()
);

-- ============================================================
-- Indeksy
-- ============================================================

create index if not exists idx_events_status   on events(status);
create index if not exists idx_events_start_at on events(start_at);
create unique index if not exists events_slug_key on events(slug);
create index if not exists idx_registrations_event_id       on registrations(event_id);
create index if not exists idx_registrations_participant_id on registrations(participant_id);
create index if not exists idx_results_event_id on results(event_id);
create index if not exists idx_results_rank     on results(rank);

-- ============================================================
-- Row Level Security (RLS)
-- Domyślna polityka: odczyt publiczny, zapis przez service role
-- Dostosuj do własnych wymagań auth
-- ============================================================

alter table events        enable row level security;
alter table participants  enable row level security;
alter table registrations enable row level security;
alter table heats         enable row level security;
alter table results       enable row level security;

-- Publiczny odczyt wydarzeń, wyników i heatów
create policy "events_public_read"   on events   for select using (true);
create policy "heats_public_read"    on heats    for select using (true);
create policy "results_public_read"  on results  for select using (true);

-- Uczestnicy: każdy może tworzyć i czytać (do rejestracji)
create policy "participants_public_read"   on participants for select using (true);
create policy "participants_public_insert" on participants for insert with check (true);

-- Rejestracje: każdy może tworzyć, każdy może czytać
create policy "registrations_public_read"   on registrations for select using (true);
create policy "registrations_public_insert" on registrations for insert with check (true);

-- Uwaga: operacje UPDATE i DELETE na rejestracje/eventy/wyniki
-- wymagają service_role key (używanej przez backend API routes).
-- Możesz dodać polityki auth gdy dodasz Supabase Auth.

-- ============================================================
-- Dane przykładowe (opcjonalne – usuń w produkcji)
-- ============================================================

insert into events (slug, title, description, location, start_at, end_at, status)
values
  (
    'zawody-agility-lato-2026',
    'Zawody Agility – Lato 2026',
    'Otwarte zawody agility dla wszystkich ras. Kategorie startowe: A1, A2, A3, Open.',
    'Warszawa, Tor Psich Sportów, ul. Psia 15',
    now() + interval '30 days',
    now() + interval '30 days' + interval '8 hours',
    'upcoming'
  ),
  (
    'grupowy-spacer-psi-czerwiec',
    'Grupowy Spacer Psi – Czerwiec',
    'Miesięczny spacer integracyjny dla właścicieli psów. Trasa 5 km, mile dla rodzin.',
    'Kraków, Planty – przy fontannie',
    now() + interval '14 days',
    now() + interval '14 days' + interval '3 hours',
    'upcoming'
  ),
  (
    'zawody-flyball-wiosna-2025',
    'Zawody Flyball – Wiosna 2025',
    'Znakomita rywalizacja drużynowa! Pobity rekord toru.',
    'Wrocław, Centrum Kynologiczne',
    now() - interval '365 days',
    now() - interval '365 days' + interval '6 hours',
    'finished'
  )
on conflict do nothing;

-- ============================================================
-- Profiles table (role management)
-- Linked 1-to-1 with auth.users via id.
-- Roles: 'user' (default) | 'organizer' | 'admin' | any future role
-- ============================================================

create table if not exists profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  role       text not null default 'user',
  full_name  text,
  company    text,
  stripe_account_id text,
  stripe_onboarded boolean default false,
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;

-- Grant table-level access so RLS policies can take effect
-- NOTE: ręczne CREATE TABLE nie dodaje automatycznie GRANT dla service_role
--       (Supabase Dashboard robi to za Ciebie, SQL Editor nie)

-- service_role: pełny dostęp (bypasses RLS — używane server-side)
grant all on public.events        to service_role;
grant all on public.heats         to service_role;
grant all on public.results       to service_role;
grant all on public.participants  to service_role;
grant all on public.registrations to service_role;
grant all on public.profiles      to service_role;
grant select on public.dogs       to service_role;

-- profiles
grant select on public.profiles to authenticated;
grant update (full_name, company) on public.profiles to authenticated;

-- event tables: anon gets SELECT, authenticated gets full DML (RLS policies restrict further)
grant select on public.events        to anon, authenticated;
grant insert, update, delete on public.events        to authenticated;

grant select on public.heats         to anon, authenticated;
grant insert, update, delete on public.heats         to authenticated;

grant select on public.results       to anon, authenticated;
grant insert, update, delete on public.results       to authenticated;

grant select on public.participants  to anon, authenticated;
grant insert, update, delete on public.participants  to authenticated;

grant select on public.registrations to anon, authenticated;
grant insert, update, delete on public.registrations to authenticated;

-- The trigger function (handle_new_user) runs as SECURITY DEFINER so it bypasses RLS.
-- This policy allows that insert path and prevents direct inserts from the anon/authenticated roles.
create policy "profiles_insert_trigger_only" on profiles
  for insert with check ( false );  -- only service_role / security definer can insert

-- Users can read their own profile; admins can read all
create policy "profiles_select_own" on profiles
  for select using ( auth.uid() = id );

-- Users can update their own profile but cannot escalate their own role
create policy "profiles_update_own" on profiles
  for update using ( auth.uid() = id )
  with check (
    auth.uid() = id
    and (
      -- role must stay the same unless requester is admin (admin uses service_role key)
      role = (select role from public.profiles where id = auth.uid())
    )
  );

-- ============================================================
-- Helper function: returns current user's role (used in policies)
-- ============================================================

create or replace function public.user_role()
returns text language sql stable security definer as $$
  select coalesce(
    (select role from public.profiles where id = auth.uid()),
    'user'
  )
$$;

-- ============================================================
-- Trigger: auto-create profile on new user sign-up
-- ============================================================

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, role, full_name, company)
  values (
    new.id,
    'user',
    coalesce(new.raw_user_meta_data->>'full_name', null),
    coalesce(new.raw_user_meta_data->>'company', null)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================
-- Write-protection policies (require organizer or admin role)
-- These complement the existing public-read policies above.
-- ============================================================

-- events: organizer/admin can insert, update, delete
create policy "events_organizer_insert" on events
  for insert with check ( public.user_role() in ('organizer', 'admin') );

create policy "events_organizer_update" on events
  for update using ( public.user_role() in ('organizer', 'admin') );

create policy "events_organizer_delete" on events
  for delete using ( public.user_role() in ('organizer', 'admin') );

-- heats: organizer/admin write access
create policy "heats_organizer_insert" on heats
  for insert with check ( public.user_role() in ('organizer', 'admin') );

create policy "heats_organizer_update" on heats
  for update using ( public.user_role() in ('organizer', 'admin') );

create policy "heats_organizer_delete" on heats
  for delete using ( public.user_role() in ('organizer', 'admin') );

-- results: organizer/admin write access
create policy "results_organizer_insert" on results
  for insert with check ( public.user_role() in ('organizer', 'admin') );

create policy "results_organizer_update" on results
  for update using ( public.user_role() in ('organizer', 'admin') );

create policy "results_organizer_delete" on results
  for delete using ( public.user_role() in ('organizer', 'admin') );

-- registrations: update/delete only for organizer/admin (anyone can still insert via existing policy)
create policy "registrations_organizer_update" on registrations
  for update using ( public.user_role() in ('organizer', 'admin') );

create policy "registrations_organizer_delete" on registrations
  for delete using ( public.user_role() in ('organizer', 'admin') );

-- participants: update/delete only for organizer/admin
create policy "participants_organizer_update" on participants
  for update using ( public.user_role() in ('organizer', 'admin') );

create policy "participants_organizer_delete" on participants
  for delete using ( public.user_role() in ('organizer', 'admin') );

-- ============================================================
-- Event types + form templates (kreator formularzy zapisów)
-- Uruchom tę sekcję w Supabase SQL Editor po wdrożeniu aplikacji
-- ============================================================

-- Nowe kolumny w tabeli events
alter table events add column if not exists event_type_id           text;
alter table events add column if not exists form_fields              jsonb not null default '[]';
alter table events add column if not exists registration_opens_at    timestamptz;
alter table events add column if not exists registration_deadline    timestamptz;
alter table events add column if not exists has_results              boolean not null default false;
alter table events add column if not exists results_public           boolean not null default true;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'events_registration_window_order_check'
      and conrelid = 'public.events'::regclass
  ) then
    alter table public.events
      add constraint events_registration_window_order_check
      check (
        registration_opens_at is null
        or registration_deadline is null
        or registration_opens_at < registration_deadline
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'events_registration_opens_before_start_check'
      and conrelid = 'public.events'::regclass
  ) then
    alter table public.events
      add constraint events_registration_opens_before_start_check
      check (
        registration_opens_at is null
        or start_at is null
        or registration_opens_at < start_at
      );
  end if;
end
$$;

drop policy if exists "registrations_public_insert" on public.registrations;
create policy "registrations_public_insert" on public.registrations
  for insert
  with check (
    exists (
      select 1
      from public.events
      where events.id = registrations.event_id
        and events.status <> 'cancelled'
        and (events.start_at is null or current_timestamp < events.start_at)
        and (events.registration_opens_at is null or current_timestamp >= events.registration_opens_at)
        and (events.registration_deadline is null or current_timestamp < events.registration_deadline)
    )
  );

-- Tabela szablonów formularzy
create table if not exists form_templates (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  event_type_id  text,
  created_by     uuid references auth.users(id) on delete cascade,
  fields         jsonb not null default '[]',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists idx_form_templates_created_by    on form_templates(created_by);
create index if not exists idx_form_templates_event_type_id on form_templates(event_type_id);

alter table form_templates enable row level security;

-- Organizatorzy zarządzają własnymi szablonami
create policy "templates_select_own" on form_templates
  for select using ( auth.uid() = created_by );
create policy "templates_insert_own" on form_templates
  for insert with check ( auth.uid() = created_by );
create policy "templates_update_own" on form_templates
  for update using ( auth.uid() = created_by );
create policy "templates_delete_own" on form_templates
  for delete using ( auth.uid() = created_by );

-- Service role + authenticated DML
grant all on public.form_templates to service_role;
grant select, insert, update, delete on public.form_templates to authenticated;

-- ============================================================
-- Treningi indywidualne (Individual Trainings)
-- ============================================================

-- Profil trenera (wizytówka)
create table if not exists trainer_profiles (
  id                 uuid primary key default gen_random_uuid(),
  slug               text not null,
  trainer_id         uuid not null unique references auth.users(id) on delete cascade,
  is_active          boolean not null default false,
  full_name          text not null,
  bio                text,
  profile_image_url  text,
  location_city      text,
  location_details   text,
  price_per_hour     decimal(8, 2),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists idx_trainer_profiles_is_active on trainer_profiles(is_active);
create index if not exists idx_trainer_profiles_trainer_id on trainer_profiles(trainer_id);
create unique index if not exists trainer_profiles_slug_key on trainer_profiles(slug);

-- Rodzaje treningów oferowanych przez trenera
create table if not exists training_types (
  id             uuid primary key default gen_random_uuid(),
  slug           text not null,
  trainer_id     uuid not null references auth.users(id) on delete cascade,
  name           text not null,  -- np. "Agility", "Behawiorystyka"
  description    text,
  price_per_hour decimal(8, 2),
  duration_min   integer not null default 60,  -- domyślnie 60 minut
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists idx_training_types_trainer_id on training_types(trainer_id);
create index if not exists idx_training_types_is_active on training_types(is_active);
create unique index if not exists training_types_trainer_slug_key on training_types(trainer_id, slug);

-- Dostępność trenera na poszczególne dni i godziny
create table if not exists training_availability (
  id             uuid primary key default gen_random_uuid(),
  training_type_id uuid not null references training_types(id) on delete cascade,
  day_of_week    integer not null,  -- 0 = niedziela, 6 = sobota (ISO 8601)
  start_time     time not null,
  end_time       time not null,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists idx_training_availability_training_type on training_availability(training_type_id);
create index if not exists idx_training_availability_active on training_availability(is_active);

-- Rezerwacje treningów
create table if not exists training_bookings (
  id                    uuid primary key default gen_random_uuid(),
  training_type_id      uuid not null references training_types(id) on delete cascade,
  user_id               uuid not null references auth.users(id) on delete cascade,
  dog_id                uuid,  -- opcjonalnie link do konkretnego psa
  scheduled_at          timestamptz not null,  -- data i godzina treningu
  duration_min          integer not null default 60,
  status                text not null default 'pending'
                        check (status in ('pending','confirmed','cancelled','completed')),
  cancellation_reason   text,
  cancellation_requested_by text,  -- 'user' lub 'trainer'
  cancellation_approved_at timestamptz,
  notes_user            text,
  notes_trainer         text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists idx_training_bookings_user_id on training_bookings(user_id);
create index if not exists idx_training_bookings_training_type on training_bookings(training_type_id);
create index if not exists idx_training_bookings_scheduled on training_bookings(scheduled_at);
create index if not exists idx_training_bookings_status on training_bookings(status);

-- Płatności za treningi
create table if not exists training_payments (
  id                       uuid primary key default gen_random_uuid(),
  booking_id               uuid not null unique references training_bookings(id) on delete cascade,
  amount                   decimal(10, 2) not null,
  currency                 text not null default 'PLN',
  stripe_session_id        text,
  stripe_payment_intent_id text,
  stripe_account_id        text,  -- connected account ID for the trainer
  status                   text not null default 'pending'
                          check (status in ('pending','completed','failed','refunded')),
  payment_method_id        text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index if not exists idx_training_payments_booking on training_payments(booking_id);
create index if not exists idx_training_payments_status on training_payments(status);

-- Row Level Security
alter table trainer_profiles enable row level security;
alter table training_types enable row level security;
alter table training_availability enable row level security;
alter table training_bookings enable row level security;
alter table training_payments enable row level security;

-- trainer_profiles: trainers manage own, all can view active
create policy "trainer_profiles_select_active" on trainer_profiles
  for select using (is_active = true OR auth.uid() = trainer_id);
create policy "trainer_profiles_insert_own" on trainer_profiles
  for insert with check (auth.uid() = trainer_id);
create policy "trainer_profiles_update_own" on trainer_profiles
  for update using (auth.uid() = trainer_id);
create policy "trainer_profiles_delete_own" on trainer_profiles
  for delete using (auth.uid() = trainer_id);

-- training_types: publicly visible if trainer is active; trainers manage own
create policy "training_types_select_public" on training_types
  for select using (
    is_active = true 
    or auth.uid() = trainer_id
  );
create policy "training_types_insert_own" on training_types
  for insert with check (auth.uid() = trainer_id);
create policy "training_types_update_own" on training_types
  for update using (auth.uid() = trainer_id);
create policy "training_types_delete_own" on training_types
  for delete using (auth.uid() = trainer_id);

-- training_availability: public for active trainers; trainers manage own
create policy "training_availability_select_public" on training_availability
  for select using (
    is_active = true 
    or auth.uid() = (select trainer_id from training_types where id = training_type_id)
  );
create policy "training_availability_insert_own" on training_availability
  for insert with check (
    auth.uid() = (select trainer_id from training_types where id = training_type_id)
  );
create policy "training_availability_update_own" on training_availability
  for update using (
    auth.uid() = (select trainer_id from training_types where id = training_type_id)
  );
create policy "training_availability_delete_own" on training_availability
  for delete using (
    auth.uid() = (select trainer_id from training_types where id = training_type_id)
  );

-- training_bookings: users see own; trainers see their type bookings
create policy "training_bookings_select_own" on training_bookings
  for select using (
    auth.uid() = user_id 
    or auth.uid() = (select trainer_id from training_types where id = training_type_id)
  );
create policy "training_bookings_insert_own" on training_bookings
  for insert with check (auth.uid() = user_id);
create policy "training_bookings_update_own" on training_bookings
  for update using (
    auth.uid() = user_id 
    or auth.uid() = (select trainer_id from training_types where id = training_type_id)
  );
create policy "training_bookings_delete_own" on training_bookings
  for delete using (auth.uid() = user_id);

-- training_payments: users see own; trainers see their trainings' payments
create policy "training_payments_select_own" on training_payments
  for select using (
    auth.uid() = (select user_id from training_bookings where id = booking_id)
    or auth.uid() = (
      select trainer_id from training_types 
      where id = (select training_type_id from training_bookings where id = booking_id)
    )
  );
create policy "training_payments_insert_own" on training_payments
  for insert with check (
    auth.uid() = (select user_id from training_bookings where id = booking_id)
  );
create policy "training_payments_update_own" on training_payments
  for update using (
    auth.uid() = (select user_id from training_bookings where id = booking_id)
    or auth.uid() = (
      select trainer_id from training_types 
      where id = (select training_type_id from training_bookings where id = booking_id)
    )
  );

-- Grant access to service role
grant all on public.trainer_profiles to service_role;
grant all on public.training_types to service_role;
grant all on public.training_availability to service_role;
grant all on public.training_bookings to service_role;
grant all on public.training_payments to service_role;

-- Grant access to authenticated users
grant select, insert, update, delete on public.trainer_profiles to authenticated;
grant select, insert, update, delete on public.training_types to authenticated;
grant select, insert, update, delete on public.training_availability to authenticated;
grant select, insert, update, delete on public.training_bookings to authenticated;
grant select, insert, update, delete on public.training_payments to authenticated;

-- ============================================================
-- Dostępność trenera na konkretne daty (nowy system)
-- ============================================================

create table if not exists trainer_date_availability (
  id           uuid primary key default gen_random_uuid(),
  trainer_id   uuid not null references auth.users(id) on delete cascade,
  available_date date not null,
  start_time   time not null,
  end_time     time not null,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique(trainer_id, available_date)
);

create index if not exists idx_trainer_date_availability_trainer_id on trainer_date_availability(trainer_id);
create index if not exists idx_trainer_date_availability_date on trainer_date_availability(available_date);
create index if not exists idx_trainer_date_availability_active on trainer_date_availability(is_active);

alter table trainer_date_availability enable row level security;

-- Trainers can manage their own availability; public can view active
create policy "trainer_date_availability_select_public" on trainer_date_availability
  for select using (
    is_active = true 
    or auth.uid() = trainer_id
  );
create policy "trainer_date_availability_insert_own" on trainer_date_availability
  for insert with check (auth.uid() = trainer_id);
create policy "trainer_date_availability_update_own" on trainer_date_availability
  for update using (auth.uid() = trainer_id);
create policy "trainer_date_availability_delete_own" on trainer_date_availability
  for delete using (auth.uid() = trainer_id);

grant all on public.trainer_date_availability to service_role;
grant select, insert, update, delete on public.trainer_date_availability to authenticated;

-- ============================================================
-- Reset hasla
-- ============================================================

create table if not exists password_reset_requests (
  email         text primary key,
  last_sent_at  timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
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

