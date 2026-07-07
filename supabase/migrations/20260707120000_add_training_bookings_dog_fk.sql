do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'training_bookings_dog_id_fkey'
      and conrelid = 'public.training_bookings'::regclass
  ) then
    alter table public.training_bookings
      add constraint training_bookings_dog_id_fkey
      foreign key (dog_id)
      references public.dogs(id)
      on delete set null
      not valid;
  end if;
end $$;

create index if not exists idx_training_bookings_dog_id
  on public.training_bookings(dog_id);
