-- Registration opening notifications and public organizer reputation.

alter table public.events
  add column if not exists registration_opens_at timestamptz;

alter table public.events
  drop constraint if exists events_registration_window_check;
alter table public.events
  add constraint events_registration_window_check check (
    registration_opens_at is null
    or registration_deadline is null
    or registration_opens_at < registration_deadline
  );

create index if not exists idx_events_registration_opens_at
  on public.events(registration_opens_at)
  where registration_opens_at is not null and status = 'upcoming';

create table if not exists public.event_registration_notifications (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  claimed_at timestamptz,
  notified_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  unique (event_id, user_id)
);

create index if not exists idx_event_registration_notifications_pending
  on public.event_registration_notifications(event_id, created_at)
  where notified_at is null;

alter table public.event_registration_notifications enable row level security;

drop policy if exists "event_registration_notifications_select_own" on public.event_registration_notifications;
create policy "event_registration_notifications_select_own"
  on public.event_registration_notifications for select
  using (auth.uid() = user_id);

drop policy if exists "event_registration_notifications_insert_own" on public.event_registration_notifications;
create policy "event_registration_notifications_insert_own"
  on public.event_registration_notifications for insert
  with check (
    auth.uid() = user_id
    and lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

drop policy if exists "event_registration_notifications_delete_own" on public.event_registration_notifications;
create policy "event_registration_notifications_delete_own"
  on public.event_registration_notifications for delete
  using (auth.uid() = user_id);

grant select, insert, delete on public.event_registration_notifications to authenticated;
grant all on public.event_registration_notifications to service_role;

create table if not exists public.organizer_profiles (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null unique references auth.users(id) on delete cascade,
  slug text not null unique,
  display_name text not null,
  organization_name text,
  bio text,
  profile_image_url text,
  location_city text,
  website_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organizer_profiles_display_name_length check (char_length(display_name) between 1 and 120),
  constraint organizer_profiles_organization_name_length check (organization_name is null or char_length(organization_name) <= 160),
  constraint organizer_profiles_bio_length check (bio is null or char_length(bio) <= 5000),
  constraint organizer_profiles_location_city_length check (location_city is null or char_length(location_city) <= 120)
);

create index if not exists idx_organizer_profiles_active
  on public.organizer_profiles(is_active, display_name);

alter table public.organizer_profiles enable row level security;

drop policy if exists "organizer_profiles_select_public" on public.organizer_profiles;
create policy "organizer_profiles_select_public"
  on public.organizer_profiles for select
  using (is_active or auth.uid() = organizer_id);

drop policy if exists "organizer_profiles_insert_own" on public.organizer_profiles;
create policy "organizer_profiles_insert_own"
  on public.organizer_profiles for insert
  with check (
    auth.uid() = organizer_id
    and public.user_role() in ('organizer', 'organizer_trainer', 'admin')
  );

drop policy if exists "organizer_profiles_update_own" on public.organizer_profiles;
create policy "organizer_profiles_update_own"
  on public.organizer_profiles for update
  using (auth.uid() = organizer_id or public.user_role() = 'admin')
  with check (auth.uid() = organizer_id or public.user_role() = 'admin');

grant select on public.organizer_profiles to anon, authenticated;
grant insert, update on public.organizer_profiles to authenticated;
grant all on public.organizer_profiles to service_role;

create table if not exists public.event_reviews (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  organizer_id uuid not null references auth.users(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  author_name text not null,
  rating integer not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, user_id),
  constraint event_reviews_author_name_length check (char_length(author_name) between 1 and 120),
  constraint event_reviews_comment_length check (comment is null or char_length(comment) <= 2000)
);

create index if not exists idx_event_reviews_organizer_created
  on public.event_reviews(organizer_id, created_at desc);
create index if not exists idx_event_reviews_user
  on public.event_reviews(user_id, created_at desc);

alter table public.event_reviews enable row level security;

drop policy if exists "event_reviews_select_public" on public.event_reviews;
create policy "event_reviews_select_public"
  on public.event_reviews for select using (true);

drop policy if exists "event_reviews_update_own" on public.event_reviews;
create policy "event_reviews_update_own"
  on public.event_reviews for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "event_reviews_delete_own" on public.event_reviews;
create policy "event_reviews_delete_own"
  on public.event_reviews for delete
  using (auth.uid() = user_id);

grant select on public.event_reviews to anon, authenticated;
grant update, delete on public.event_reviews to authenticated;
grant all on public.event_reviews to service_role;

drop trigger if exists organizer_profiles_updated_at on public.organizer_profiles;
create trigger organizer_profiles_updated_at
  before update on public.organizer_profiles
  for each row execute function public.update_updated_at_column();

drop trigger if exists event_reviews_updated_at on public.event_reviews;
create trigger event_reviews_updated_at
  before update on public.event_reviews
  for each row execute function public.update_updated_at_column();
