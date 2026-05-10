-- ============================================================
-- Migracja: kolejność startowa uczestników rejestracji
-- ============================================================

-- Indeks kolejności (drag & drop, lista startowa live)
alter table registrations add column if not exists order_index integer;

-- Wypełnij istniejące rekordy kolejnością chronologiczną (na podstawie created_at)
-- Każdy event ma własną sekwencję order_index zaczynającą się od 1
update registrations r
set order_index = sub.rn
from (
  select id,
         row_number() over (partition by event_id order by created_at) as rn
  from registrations
  where order_index is null
) sub
where r.id = sub.id;

-- Indeks dla wydajniejszego sortowania
create index if not exists idx_registrations_order_index on registrations(event_id, order_index);
