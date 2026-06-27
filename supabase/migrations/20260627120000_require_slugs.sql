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
