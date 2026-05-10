-- ============================================================
-- Migracja: sloty czasowe dla spacerów (grupy godzinowe)
-- ============================================================

-- Tabela slotów godzinowych (tylko dla eventów type=spacer)
create table if not exists time_slots (
  id               uuid primary key default gen_random_uuid(),
  event_id         uuid not null references events(id) on delete cascade,
  slot_date        date not null,
  slot_time        time not null,
  label            text,                   -- opcjonalna etykieta np. "Trasa A – poranek"
  max_participants integer,                -- null = bez limitu
  created_at       timestamptz not null default now()
);

create index if not exists idx_time_slots_event_id on time_slots(event_id);

alter table time_slots enable row level security;

-- Publiczny odczyt slotów
create policy "time_slots_public_read" on time_slots
  for select using (true);

-- Tylko organizer/admin może zarządzać slotami
create policy "time_slots_organizer_insert" on time_slots
  for insert with check ( public.user_role() in ('organizer', 'admin') );

create policy "time_slots_organizer_update" on time_slots
  for update using ( public.user_role() in ('organizer', 'admin') );

create policy "time_slots_organizer_delete" on time_slots
  for delete using ( public.user_role() in ('organizer', 'admin') );

-- Dostęp dla ról
grant all on public.time_slots to service_role;
grant select on public.time_slots to anon, authenticated;
grant insert, update, delete on public.time_slots to authenticated;

-- Przypisanie uczestnika do slotu w rejestracji
alter table registrations add column if not exists time_slot_id uuid references time_slots(id) on delete set null;

-- Indeks dla szybkiego wyszukiwania uczestników slotu
create index if not exists idx_registrations_time_slot_id on registrations(time_slot_id);

-- Flaga czy grafik został już wysłany do uczestnika
alter table registrations add column if not exists schedule_sent_at timestamptz;
