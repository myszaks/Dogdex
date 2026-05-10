-- ============================================================
-- Migracja: geolokalizacja i galeria zdjęć dla eventów
-- ============================================================

-- Współrzędne geograficzne (pinezka na mapie)
alter table events add column if not exists lat  double precision;
alter table events add column if not exists lng  double precision;

-- Galeria zdjęć w opisie eventu (tablica URL-i)
alter table events add column if not exists gallery_images text[] not null default '{}';
