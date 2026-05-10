-- ============================================================
-- Migracja: wskaźnik aktualnego zawodnika na starcie (live)
-- ============================================================

-- Indeks wskazujący, który uczestnik (wg order_index) aktualnie startuje
-- 0 = przed startem, 1 = pierwszy uczestnik, itd.
alter table events add column if not exists current_start_index integer not null default 0;
