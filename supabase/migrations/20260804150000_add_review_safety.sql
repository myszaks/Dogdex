-- Verified reviews, owner responses, user reports and administrator moderation.
-- Also adds an atomic claim for announcement deliveries, preventing overlapping
-- cron and organizer requests from sending the same message concurrently.

alter table public.event_announcement_deliveries
  add column if not exists claimed_at timestamptz;

create index if not exists idx_event_announcement_deliveries_pending
  on public.event_announcement_deliveries(created_at, id)
  where status = 'pending';

create or replace function public.claim_event_announcement_deliveries(
  p_announcement_id uuid default null,
  p_limit integer default 100,
  p_stale_before timestamptz default now() - interval '30 minutes'
)
returns setof public.event_announcement_deliveries
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_limit < 1 or p_limit > 500 then
    raise exception 'invalid_announcement_delivery_limit';
  end if;

  return query
  with candidates as (
    select delivery.id
    from public.event_announcement_deliveries delivery
    where delivery.status = 'pending'
      and delivery.attempt_count < 3
      and (p_announcement_id is null or delivery.announcement_id = p_announcement_id)
      and (delivery.claimed_at is null or delivery.claimed_at < p_stale_before)
    order by delivery.created_at, delivery.id
    for update skip locked
    limit p_limit
  )
  update public.event_announcement_deliveries delivery
  set claimed_at = now(),
      attempt_count = delivery.attempt_count + 1,
      error = null
  from candidates
  where delivery.id = candidates.id
  returning delivery.*;
end;
$$;

revoke all on function public.claim_event_announcement_deliveries(uuid, integer, timestamptz)
  from public, anon, authenticated;
grant execute on function public.claim_event_announcement_deliveries(uuid, integer, timestamptz)
  to service_role;

alter table public.event_reviews
  add column if not exists is_verified boolean not null default true,
  add column if not exists moderation_status text not null default 'published',
  add column if not exists moderation_reason text,
  add column if not exists moderated_at timestamptz,
  add column if not exists moderated_by uuid references auth.users(id) on delete set null,
  add column if not exists response_text text,
  add column if not exists response_at timestamptz,
  add column if not exists response_by uuid references auth.users(id) on delete set null;

alter table public.event_reviews
  drop constraint if exists event_reviews_moderation_status_check,
  add constraint event_reviews_moderation_status_check
    check (moderation_status in ('published', 'hidden', 'removed')),
  drop constraint if exists event_reviews_response_length_check,
  add constraint event_reviews_response_length_check
    check (response_text is null or char_length(response_text) between 1 and 2000);

alter table public.training_reviews
  add column if not exists is_verified boolean not null default true,
  add column if not exists moderation_status text not null default 'published',
  add column if not exists moderation_reason text,
  add column if not exists moderated_at timestamptz,
  add column if not exists moderated_by uuid references auth.users(id) on delete set null,
  add column if not exists response_text text,
  add column if not exists response_at timestamptz,
  add column if not exists response_by uuid references auth.users(id) on delete set null;

alter table public.training_reviews
  drop constraint if exists training_reviews_moderation_status_check,
  add constraint training_reviews_moderation_status_check
    check (moderation_status in ('published', 'hidden', 'removed')),
  drop constraint if exists training_reviews_response_length_check,
  add constraint training_reviews_response_length_check
    check (response_text is null or char_length(response_text) between 1 and 2000);

drop policy if exists "event_reviews_select_public" on public.event_reviews;
create policy "event_reviews_select_public"
  on public.event_reviews for select
  using (
    moderation_status = 'published'
    or auth.uid() = user_id
    or auth.uid() = organizer_id
    or public.user_role() = 'admin'
  );

drop policy if exists "event_reviews_update_own" on public.event_reviews;
drop policy if exists "event_reviews_delete_own" on public.event_reviews;
revoke update, delete on public.event_reviews from authenticated;

drop policy if exists "training_reviews_select_public" on public.training_reviews;
create policy "training_reviews_select_public"
  on public.training_reviews for select
  using (
    (moderation_status = 'published' and exists (
      select 1 from public.trainer_profiles profile
      where profile.trainer_id = training_reviews.trainer_id and profile.is_active
    ))
    or auth.uid() = user_id
    or auth.uid() = trainer_id
    or public.user_role() = 'admin'
  );

drop policy if exists "training_reviews_insert_completed_own" on public.training_reviews;
drop policy if exists "training_reviews_update_own" on public.training_reviews;
drop policy if exists "training_reviews_delete_own" on public.training_reviews;
revoke insert, update, delete on public.training_reviews from authenticated;

create table if not exists public.review_reports (
  id uuid primary key default gen_random_uuid(),
  review_type text not null check (review_type in ('event', 'training')),
  review_id uuid not null,
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reason text not null check (reason in ('spam', 'offensive', 'privacy', 'conflict', 'other')),
  details text,
  status text not null default 'pending' check (status in ('pending', 'dismissed', 'actioned')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null,
  resolution_note text,
  unique (review_type, review_id, reporter_id),
  constraint review_reports_details_length check (details is null or char_length(details) <= 1000),
  constraint review_reports_resolution_note_length check (resolution_note is null or char_length(resolution_note) <= 1000)
);

create index if not exists idx_review_reports_pending
  on public.review_reports(created_at)
  where status = 'pending';

create or replace function public.validate_review_report_target()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  review_author uuid;
begin
  if new.review_type = 'event' then
    select user_id into review_author from public.event_reviews where id = new.review_id;
  else
    select user_id into review_author from public.training_reviews where id = new.review_id;
  end if;
  if review_author is null then
    raise exception 'Review does not exist';
  end if;
  if review_author = new.reporter_id then
    raise exception 'Review author cannot report own review';
  end if;
  return new;
end;
$$;

drop trigger if exists validate_review_report_target on public.review_reports;
create trigger validate_review_report_target
  before insert or update of review_type, review_id, reporter_id on public.review_reports
  for each row execute function public.validate_review_report_target();

alter table public.review_reports enable row level security;

drop policy if exists "review_reports_select_own_or_admin" on public.review_reports;
create policy "review_reports_select_own_or_admin"
  on public.review_reports for select
  using (auth.uid() = reporter_id or public.user_role() = 'admin');

drop policy if exists "review_reports_insert_own" on public.review_reports;
create policy "review_reports_insert_own"
  on public.review_reports for insert
  with check (auth.uid() = reporter_id);

grant select, insert on public.review_reports to authenticated;
grant all on public.review_reports to service_role;

create index if not exists idx_event_reviews_public
  on public.event_reviews(organizer_id, created_at desc)
  where moderation_status = 'published';
create index if not exists idx_training_reviews_public
  on public.training_reviews(trainer_id, created_at desc)
  where moderation_status = 'published';
