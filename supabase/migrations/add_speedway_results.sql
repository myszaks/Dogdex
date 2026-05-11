-- ============================================================
-- Speedway / Wyścigi – rozszerzenie tabeli results i events
-- Uruchom w: Supabase → SQL Editor → Run
-- ============================================================

-- Kolumny czasu dla dwóch przebiegów
ALTER TABLE results ADD COLUMN IF NOT EXISTS run1_ms integer;
ALTER TABLE results ADD COLUMN IF NOT EXISTS run2_ms integer;

-- Najlepszy czas (min z run1/run2), przechowywany dla łatwego sortowania
ALTER TABLE results ADD COLUMN IF NOT EXISTS best_ms integer;

-- Prędkość obliczona z best_ms i długości toru
ALTER TABLE results ADD COLUMN IF NOT EXISTS speed_kmh numeric(5,2);

-- Klasa rozmiarowa psa: XS / S / M / L / XL
ALTER TABLE results ADD COLUMN IF NOT EXISTS size_class text;

-- Miejsce w klasie (obliczane przez endpoint recalculate-ranks)
ALTER TABLE results ADD COLUMN IF NOT EXISTS class_rank integer;

-- Status przebiegu: NULL = normalny czas, 'DNS' = nie startował, 'DNF' = nie ukończył
ALTER TABLE results ADD COLUMN IF NOT EXISTS run1_status text CHECK (run1_status IN ('DNS', 'DNF'));
ALTER TABLE results ADD COLUMN IF NOT EXISTS run2_status text CHECK (run2_status IN ('DNS', 'DNF'));

-- Długość toru w metrach (konfigurowana per wydarzenie)
ALTER TABLE events ADD COLUMN IF NOT EXISTS track_distance_m numeric(6,2);

-- Indeks dla szybkiego sortowania w klasie
CREATE INDEX IF NOT EXISTS idx_results_size_class ON results(event_id, size_class, best_ms);

-- ============================================================
-- Odprawa przed zawodami (check-in) + faza live
-- ============================================================

-- Odprawa: czy pies przeszedł odprawę (zarejestrowanie + weryfikacja)
ALTER TABLE registrations ADD COLUMN IF NOT EXISTS checked_in boolean DEFAULT false;
ALTER TABLE registrations ADD COLUMN IF NOT EXISTS checked_in_at timestamptz;

-- Faza live wydarzenia: NULL / 'registration' / 'checkin' / 'running' / 'podium'
ALTER TABLE events ADD COLUMN IF NOT EXISTS live_phase text;
