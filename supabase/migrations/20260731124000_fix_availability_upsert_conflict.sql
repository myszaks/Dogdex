-- Let idempotent inserts reach the exact-slot unique index. PostgreSQL checks
-- BEFORE triggers before resolving ON CONFLICT, so the overlap trigger must
-- ignore an already existing identical interval.

create or replace function public.enforce_trainer_date_availability_conflict()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not new.is_active then
    return new;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(new.trainer_id::text || ':' || new.available_date::text, 0)
  );

  if tg_op = 'INSERT' and exists (
    select 1
    from public.trainer_date_availability slot
    where slot.trainer_id = new.trainer_id
      and slot.available_date = new.available_date
      and slot.start_time = new.start_time
      and slot.end_time = new.end_time
      and slot.is_active = new.is_active
  ) then
    return new;
  end if;

  if exists (
    select 1
    from public.trainer_date_availability slot
    where slot.trainer_id = new.trainer_id
      and slot.available_date = new.available_date
      and slot.is_active
      and slot.id <> new.id
      and slot.start_time < new.end_time
      and slot.end_time > new.start_time
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'trainer_date_availability_conflict';
  end if;

  return new;
end;
$$;
