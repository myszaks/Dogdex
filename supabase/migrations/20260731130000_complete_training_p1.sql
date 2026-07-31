-- P1: cancellation policy, reliable reminders, reviews and trainer analytics data.

alter table public.trainer_profiles
  add column if not exists cancellation_buffer_hours integer not null default 24;

alter table public.trainer_profiles
  drop constraint if exists trainer_profiles_cancellation_buffer_hours_check;
alter table public.trainer_profiles
  add constraint trainer_profiles_cancellation_buffer_hours_check
  check (cancellation_buffer_hours between 0 and 168);

alter table public.training_bookings
  add column if not exists reminder_sent_at timestamptz;

create index if not exists idx_training_bookings_reminder_due
  on public.training_bookings(scheduled_at)
  where status = 'confirmed' and reminder_sent_at is null;

create table if not exists public.training_reviews (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.training_bookings(id) on delete cascade,
  trainer_id uuid not null references auth.users(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  author_name text not null default 'Użytkownik',
  rating integer not null check (rating between 1 and 5),
  comment text check (comment is null or char_length(comment) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_training_reviews_trainer_created
  on public.training_reviews(trainer_id, created_at desc);
create index if not exists idx_training_reviews_user
  on public.training_reviews(user_id);

alter table public.training_reviews enable row level security;

drop policy if exists "training_reviews_select_public" on public.training_reviews;
create policy "training_reviews_select_public"
  on public.training_reviews
  for select
  using (
    auth.uid() = user_id
    or auth.uid() = trainer_id
    or exists (
      select 1
      from public.trainer_profiles profile
      where profile.trainer_id = training_reviews.trainer_id
        and profile.is_active
    )
  );

drop policy if exists "training_reviews_insert_completed_own" on public.training_reviews;
create policy "training_reviews_insert_completed_own"
  on public.training_reviews
  for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.training_bookings booking
      join public.training_types training_type
        on training_type.id = booking.training_type_id
      where booking.id = training_reviews.booking_id
        and booking.user_id = auth.uid()
        and booking.status = 'completed'
        and training_type.trainer_id = training_reviews.trainer_id
    )
  );

drop policy if exists "training_reviews_update_own" on public.training_reviews;
create policy "training_reviews_update_own"
  on public.training_reviews
  for update
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.training_bookings booking
      join public.training_types training_type
        on training_type.id = booking.training_type_id
      where booking.id = training_reviews.booking_id
        and booking.user_id = auth.uid()
        and booking.status = 'completed'
        and training_type.trainer_id = training_reviews.trainer_id
    )
  );

drop policy if exists "training_reviews_delete_own" on public.training_reviews;
create policy "training_reviews_delete_own"
  on public.training_reviews
  for delete
  using (auth.uid() = user_id);

grant all on public.training_reviews to service_role;
grant select, insert, update, delete on public.training_reviews to authenticated;
grant select on public.training_reviews to anon;

create or replace function public.claim_training_reminders(
  window_start timestamptz,
  window_end timestamptz,
  batch_size integer default 100
)
returns table (
  booking_id uuid,
  claimed_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if window_end <= window_start then
    raise exception using errcode = '22023', message = 'invalid_reminder_window';
  end if;

  return query
  with due as (
    select booking.id
    from public.training_bookings booking
    where booking.status = 'confirmed'
      and booking.reminder_sent_at is null
      and booking.scheduled_at >= window_start
      and booking.scheduled_at < window_end
    order by booking.scheduled_at
    for update skip locked
    limit least(greatest(batch_size, 1), 500)
  ),
  claimed as (
    update public.training_bookings booking
    set reminder_sent_at = now(),
        updated_at = now()
    from due
    where booking.id = due.id
    returning booking.id, booking.reminder_sent_at
  )
  select claimed.id, claimed.reminder_sent_at
  from claimed;
end;
$$;

create or replace function public.release_training_reminder_claim(
  target_booking_id uuid,
  target_claimed_at timestamptz
)
returns boolean
language sql
security definer
set search_path = ''
as $$
  with released as (
    update public.training_bookings
    set reminder_sent_at = null,
        updated_at = now()
    where id = target_booking_id
      and reminder_sent_at = target_claimed_at
    returning id
  )
  select exists(select 1 from released);
$$;

revoke all on function public.claim_training_reminders(timestamptz, timestamptz, integer) from public;
revoke all on function public.release_training_reminder_claim(uuid, timestamptz) from public;
grant execute on function public.claim_training_reminders(timestamptz, timestamptz, integer) to service_role;
grant execute on function public.release_training_reminder_claim(uuid, timestamptz) to service_role;
