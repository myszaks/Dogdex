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
  title       text not null,
  description text,
  start_at    timestamptz,
  end_at      timestamptz,
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

insert into events (title, description, location, start_at, end_at, status)
values
  (
    'Zawody Agility – Lato 2026',
    'Otwarte zawody agility dla wszystkich ras. Kategorie startowe: A1, A2, A3, Open.',
    'Warszawa, Tor Psich Sportów, ul. Psia 15',
    now() + interval '30 days',
    now() + interval '30 days' + interval '8 hours',
    'upcoming'
  ),
  (
    'Grupowy Spacer Psi – Czerwiec',
    'Miesięczny spacer integracyjny dla właścicieli psów. Trasa 5 km, mile dla rodzin.',
    'Kraków, Planty – przy fontannie',
    now() + interval '14 days',
    now() + interval '14 days' + interval '3 hours',
    'upcoming'
  ),
  (
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
alter table events add column if not exists registration_deadline    timestamptz;
alter table events add column if not exists has_results              boolean not null default false;
alter table events add column if not exists results_public           boolean not null default true;

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

