-- ============================================================
-- Migracja: grupowanie uczestników i śledzenie zmian eventu
-- ============================================================

-- Pole, po którym grupowane są zapisy (np. 'multidate', 'speed_class', null = brak grupowania)
-- Przechowuje nazwę pola z form_fields eventu
alter table events add column if not exists grouping_field text;

-- Ostatnia znacząca zmiana (data/lokalizacja) – do wyświetlania ostrzeżeń na kartach
alter table events add column if not exists last_significant_change timestamptz;

-- Które pola się zmieniły ('start_at', 'end_at', 'location', 'title')
alter table events add column if not exists changed_fields text[] not null default '{}';
