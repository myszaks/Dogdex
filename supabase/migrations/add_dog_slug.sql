-- ============================================================
-- Dogs: dodanie pola slug (unikalne per user_id, nullable)
-- ============================================================

alter table dogs add column if not exists slug text;

-- Partial unique index — pozwala na null, wymusza unikalność (user_id, slug)
create unique index if not exists dogs_user_slug_unique
  on dogs (user_id, slug)
  where slug is not null;

-- ============================================================
-- Backfill: generuj slug dla istniejących psów
-- ============================================================

-- Pomocnicza funkcja normalizująca tekst do sluga
create or replace function _dogdex_to_slug(input text) returns text language sql immutable as $$
  select regexp_replace(
    regexp_replace(
      lower(
        translate(
          translate(input, 'ąćęłńóśźżĄĆĘŁŃÓŚŹŻ', 'acelnoszacelnosza'),
          'ĄĆĘŁŃÓŚŹŻąćęłńóśźż', 'ACELNOSZAacelnoszą'  -- drugi pass zbiera resztę
        )
      ),
      '[^a-z0-9\s-]', '', 'g'
    ),
    '\s+', '-', 'g'
  );
$$;

-- Backfill: nadaj slug psom bez sluga z obsługą konfliktów per (user_id)
do $$
declare
  rec   record;
  base  text;
  candidate text;
  i     int;
begin
  for rec in
    select id, user_id, name from dogs where slug is null order by created_at
  loop
    base := _dogdex_to_slug(rec.name);
    if base = '' then base := rec.id::text; end if;
    candidate := base;
    i := 1;
    loop
      -- sprawdź czy kandydat jest wolny dla tego usera
      if not exists (
        select 1 from dogs
        where user_id = rec.user_id and slug = candidate and id <> rec.id
      ) then
        update dogs set slug = candidate where id = rec.id;
        exit;
      end if;
      candidate := base || '-' || i;
      i := i + 1;
    end loop;
  end loop;
end;
$$;

-- Opcjonalnie usuń pomocniczą funkcję po migracji
drop function if exists _dogdex_to_slug(text);
