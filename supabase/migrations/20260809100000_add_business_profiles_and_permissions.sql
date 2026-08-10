-- Shared business/club ownership and granular team permissions.
-- Legacy trainer_id and organizer team records stay in place during the hybrid rollout.

create table if not exists public.business_profiles (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 160),
  slug text not null unique,
  profile_type text not null default 'individual'
    check (profile_type in ('individual', 'organization')),
  status text not null default 'active' check (status in ('active', 'archived')),
  is_default boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists business_profiles_default_owner_key
  on public.business_profiles(owner_id) where is_default;
create index if not exists idx_business_profiles_owner on public.business_profiles(owner_id, status);

create table if not exists public.business_profile_members (
  id uuid primary key default gen_random_uuid(),
  business_profile_id uuid not null references public.business_profiles(id) on delete cascade,
  email text not null,
  user_id uuid references auth.users(id) on delete set null,
  role_title text,
  permissions text[] not null,
  status text not null default 'pending' check (status in ('pending', 'active', 'disabled')),
  invited_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint business_profile_members_email_normalized check (email = lower(trim(email))),
  constraint business_profile_members_permissions_valid check (
    cardinality(permissions) > 0 and permissions <@ array[
      'profile.manage', 'team.manage',
      'events.create', 'events.edit', 'events.registrations', 'events.checkin', 'events.results', 'events.finance',
      'trainings.offer', 'trainings.schedule', 'trainings.bookings', 'trainings.attendance', 'customers.view', 'passes.manage',
      'payments.view', 'refunds.manage'
    ]::text[]
  ),
  unique (business_profile_id, email)
);

create index if not exists idx_business_profile_members_user
  on public.business_profile_members(user_id, business_profile_id, status);

create table if not exists public.business_profile_audit_log (
  id uuid primary key default gen_random_uuid(),
  business_profile_id uuid not null references public.business_profiles(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null check (char_length(action) between 1 and 120),
  target_type text check (target_type is null or char_length(target_type) <= 80),
  target_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_business_profile_audit_log_profile_time
  on public.business_profile_audit_log(business_profile_id, created_at desc);

drop trigger if exists business_profiles_updated_at on public.business_profiles;
create trigger business_profiles_updated_at before update on public.business_profiles
  for each row execute function public.update_updated_at_column();
drop trigger if exists business_profile_members_updated_at on public.business_profile_members;
create trigger business_profile_members_updated_at before update on public.business_profile_members
  for each row execute function public.update_updated_at_column();

create or replace function public.business_profile_has_permission(
  target_profile_id uuid,
  required_permission text default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and (
    exists (
      select 1 from public.business_profiles profile
      where profile.id = target_profile_id
        and profile.status = 'active'
        and profile.owner_id = auth.uid()
    )
    or public.user_role() = 'admin'
    or exists (
      select 1 from public.business_profile_members member
      where member.business_profile_id = target_profile_id
        and member.status in ('pending', 'active')
        and (
          member.user_id = auth.uid()
          or (
            member.email = lower(coalesce(auth.jwt() ->> 'email', ''))
          )
        )
        and (required_permission is null or required_permission = any(member.permissions))
    )
  );
$$;

revoke all on function public.business_profile_has_permission(uuid, text) from public;
grant execute on function public.business_profile_has_permission(uuid, text) to authenticated, service_role;

alter table public.business_profiles enable row level security;
alter table public.business_profile_members enable row level security;
alter table public.business_profile_audit_log enable row level security;

create policy "business_profiles_member_read" on public.business_profiles for select to authenticated
  using (public.business_profile_has_permission(id, null));
create policy "business_members_team_read" on public.business_profile_members for select to authenticated
  using (public.business_profile_has_permission(business_profile_id, null));
create policy "business_audit_manager_read" on public.business_profile_audit_log for select to authenticated
  using (public.business_profile_has_permission(business_profile_id, 'team.manage'));

grant select on public.business_profiles to authenticated;
grant select on public.business_profile_members to authenticated;
grant select on public.business_profile_audit_log to authenticated;
grant all on public.business_profiles, public.business_profile_members, public.business_profile_audit_log to service_role;

alter table public.events add column if not exists business_profile_id uuid
  references public.business_profiles(id) on delete restrict;
alter table public.organizer_profiles add column if not exists business_profile_id uuid
  references public.business_profiles(id) on delete restrict;
alter table public.trainer_profiles add column if not exists business_profile_id uuid
  references public.business_profiles(id) on delete restrict;

-- Every current organizer/trainer receives a default business profile. A short UUID
-- suffix makes the technical slug deterministic and collision-free.
insert into public.business_profiles (owner_id, name, slug, profile_type)
select
  account.id,
  coalesce(
    nullif(trim(organizer.organization_name), ''),
    nullif(trim(organizer.display_name), ''),
    nullif(trim(trainer.full_name), ''),
    nullif(trim(account.full_name), ''),
    nullif(trim(account.company), ''),
    split_part(auth_user.email, '@', 1),
    'Profil Dogdex'
  ),
  'profil-' || replace(account.id::text, '-', ''),
  case when nullif(trim(coalesce(organizer.organization_name, account.company)), '') is null
    then 'individual' else 'organization' end
from public.profiles account
join auth.users auth_user on auth_user.id = account.id
left join public.organizer_profiles organizer on organizer.organizer_id = account.id
left join public.trainer_profiles trainer on trainer.trainer_id = account.id
where account.role in ('organizer', 'trainer', 'organizer_trainer', 'admin')
on conflict do nothing;

insert into public.business_profile_members (
  business_profile_id, email, user_id, role_title, permissions, status, invited_by
)
select
  profile.id, lower(auth_user.email), profile.owner_id, 'Właściciel', array[
    'profile.manage', 'team.manage',
    'events.create', 'events.edit', 'events.registrations', 'events.checkin', 'events.results', 'events.finance',
    'trainings.offer', 'trainings.schedule', 'trainings.bookings', 'trainings.attendance', 'customers.view', 'passes.manage',
    'payments.view', 'refunds.manage'
  ]::text[], 'active', profile.owner_id
from public.business_profiles profile
join auth.users auth_user on auth_user.id = profile.owner_id
where auth_user.email is not null
on conflict (business_profile_id, email) do nothing;

update public.events resource set business_profile_id = profile.id
from public.business_profiles profile
where resource.business_profile_id is null and profile.owner_id = resource.created_by and profile.is_default;
update public.organizer_profiles resource set business_profile_id = profile.id
from public.business_profiles profile
where resource.business_profile_id is null and profile.owner_id = resource.organizer_id and profile.is_default;
update public.trainer_profiles resource set business_profile_id = profile.id
from public.business_profiles profile
where resource.business_profile_id is null and profile.owner_id = resource.trainer_id and profile.is_default;

create index if not exists idx_events_business_profile on public.events(business_profile_id, start_at);
create index if not exists idx_organizer_profiles_business_profile on public.organizer_profiles(business_profile_id);
create index if not exists idx_trainer_profiles_business_profile on public.trainer_profiles(business_profile_id);

create or replace function public.assign_event_business_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.business_profile_id is null then
    select id into new.business_profile_id from public.business_profiles
    where owner_id = new.created_by and is_default and status = 'active' limit 1;
  end if;
  return new;
end;
$$;
revoke all on function public.assign_event_business_profile() from public;
drop trigger if exists events_assign_business_profile on public.events;
create trigger events_assign_business_profile before insert on public.events
  for each row execute function public.assign_event_business_profile();

create or replace function public.ensure_default_business_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_profile_id uuid;
  account_email text;
begin
  if new.role::text not in ('organizer', 'trainer', 'organizer_trainer', 'admin') then
    return new;
  end if;

  select id into target_profile_id from public.business_profiles
  where owner_id = new.id and is_default limit 1;

  if target_profile_id is null then
    insert into public.business_profiles (owner_id, name, slug, profile_type)
    values (
      new.id,
      coalesce(nullif(trim(new.company), ''), nullif(trim(new.full_name), ''), 'Profil Dogdex'),
      'profil-' || replace(new.id::text, '-', ''),
      case when nullif(trim(new.company), '') is null then 'individual' else 'organization' end
    )
    on conflict do nothing
    returning id into target_profile_id;
    if target_profile_id is null then
      select id into target_profile_id from public.business_profiles
      where owner_id = new.id and is_default limit 1;
    end if;
  end if;

  select lower(email) into account_email from auth.users where id = new.id;
  if target_profile_id is not null and account_email is not null then
    insert into public.business_profile_members (
      business_profile_id, email, user_id, role_title, permissions, status, invited_by
    ) values (
      target_profile_id, account_email, new.id, 'Właściciel', array[
        'profile.manage', 'team.manage',
        'events.create', 'events.edit', 'events.registrations', 'events.checkin', 'events.results', 'events.finance',
        'trainings.offer', 'trainings.schedule', 'trainings.bookings', 'trainings.attendance', 'customers.view', 'passes.manage',
        'payments.view', 'refunds.manage'
      ]::text[], 'active', new.id
    ) on conflict (business_profile_id, email) do nothing;
  end if;
  return new;
end;
$$;

revoke all on function public.ensure_default_business_profile() from public;
drop trigger if exists profiles_ensure_default_business_profile on public.profiles;
create trigger profiles_ensure_default_business_profile
  after insert or update of role on public.profiles
  for each row execute function public.ensure_default_business_profile();

-- Preserve the existing organizer directory and translate its event scopes.
insert into public.business_profile_members (
  business_profile_id, email, user_id, role_title, permissions, status, invited_by, created_at, updated_at
)
select
  profile.id,
  member.email,
  member.user_id,
  'Zespół organizatora',
  array_remove(array[
    case when 'registrations' = any(member.default_permissions) then 'events.registrations' end,
    case when 'registrations' = any(member.default_permissions) then 'customers.view' end,
    case when 'checkin' = any(member.default_permissions) then 'events.checkin' end,
    case when 'results' = any(member.default_permissions) then 'events.results' end,
    case when 'finance' = any(member.default_permissions) then 'events.finance' end,
    case when 'finance' = any(member.default_permissions) then 'payments.view' end
  ]::text[], null),
  member.status,
  member.invited_by,
  member.created_at,
  member.updated_at
from public.organizer_team_members member
join public.business_profiles profile on profile.owner_id = member.organizer_id and profile.is_default
where cardinality(member.default_permissions) > 0
on conflict (business_profile_id, email) do nothing;

-- Link training resources to the business profile while trainer_id remains the
-- lead trainer and compatibility/payout identifier.
alter table public.training_types add column if not exists business_profile_id uuid
  references public.business_profiles(id) on delete restrict;
alter table public.training_courses add column if not exists business_profile_id uuid
  references public.business_profiles(id) on delete restrict;
alter table public.training_pass_products add column if not exists business_profile_id uuid
  references public.business_profiles(id) on delete restrict;
alter table public.training_commerce_payments add column if not exists business_profile_id uuid
  references public.business_profiles(id) on delete restrict;
alter table public.trainer_date_availability add column if not exists business_profile_id uuid
  references public.business_profiles(id) on delete restrict;
alter table public.training_bookings add column if not exists business_profile_id uuid
  references public.business_profiles(id) on delete restrict;
alter table public.training_payments add column if not exists business_profile_id uuid
  references public.business_profiles(id) on delete restrict;
alter table public.event_payments add column if not exists business_profile_id uuid
  references public.business_profiles(id) on delete restrict;

update public.training_types resource set business_profile_id = profile.id
from public.business_profiles profile
where resource.business_profile_id is null and profile.owner_id = resource.trainer_id and profile.is_default;
update public.training_courses resource set business_profile_id = profile.id
from public.business_profiles profile
where resource.business_profile_id is null and profile.owner_id = resource.trainer_id and profile.is_default;
update public.training_pass_products resource set business_profile_id = profile.id
from public.business_profiles profile
where resource.business_profile_id is null and profile.owner_id = resource.trainer_id and profile.is_default;
update public.training_commerce_payments payment set business_profile_id = coalesce(course.business_profile_id, product.business_profile_id)
from public.training_commerce_payments source
left join public.training_course_enrollments enrollment on enrollment.id = source.enrollment_id
left join public.training_courses course on course.id = enrollment.course_id
left join public.training_passes pass on pass.id = source.pass_id
left join public.training_pass_products product on product.id = pass.product_id
where payment.id = source.id and payment.business_profile_id is null;
update public.trainer_date_availability resource set business_profile_id = profile.id
from public.business_profiles profile
where resource.business_profile_id is null and profile.owner_id = resource.trainer_id and profile.is_default;
update public.training_bookings booking set business_profile_id = training_type.business_profile_id
from public.training_types training_type
where booking.business_profile_id is null and training_type.id = booking.training_type_id;
update public.training_payments payment set business_profile_id = booking.business_profile_id
from public.training_bookings booking
where payment.business_profile_id is null and booking.id = payment.booking_id;
update public.event_payments payment set business_profile_id = event.business_profile_id
from public.registrations registration
join public.events event on event.id = registration.event_id
where payment.business_profile_id is null and registration.id = payment.registration_id;

create index if not exists idx_training_types_business_profile on public.training_types(business_profile_id);
create index if not exists idx_training_courses_business_profile on public.training_courses(business_profile_id, status);
create index if not exists idx_training_pass_products_business_profile on public.training_pass_products(business_profile_id, is_active);
create index if not exists idx_training_commerce_payments_business_profile on public.training_commerce_payments(business_profile_id, created_at desc);
create index if not exists idx_trainer_date_availability_business_profile on public.trainer_date_availability(business_profile_id, available_date);
create index if not exists idx_training_bookings_business_profile on public.training_bookings(business_profile_id, scheduled_at desc);
create index if not exists idx_training_payments_business_profile on public.training_payments(business_profile_id, created_at desc);
create index if not exists idx_event_payments_business_profile on public.event_payments(business_profile_id, created_at desc);

create policy "training_types_business_team_read" on public.training_types for select to authenticated
  using (business_profile_id is not null and public.business_profile_has_permission(business_profile_id, 'trainings.offer'));
create policy "training_courses_business_team_read" on public.training_courses for select to authenticated
  using (business_profile_id is not null and (
    public.business_profile_has_permission(business_profile_id, 'trainings.offer')
    or public.business_profile_has_permission(business_profile_id, 'trainings.schedule')
    or public.business_profile_has_permission(business_profile_id, 'trainings.attendance')
    or public.business_profile_has_permission(business_profile_id, 'customers.view')
  ));
create policy "training_sessions_business_team_read" on public.training_course_sessions for select to authenticated
  using (exists (select 1 from public.training_courses course where course.id = course_id and public.business_profile_has_permission(course.business_profile_id, 'trainings.schedule')));
create policy "training_enrollments_business_team_read" on public.training_course_enrollments for select to authenticated
  using (exists (select 1 from public.training_courses course where course.id = course_id and public.business_profile_has_permission(course.business_profile_id, 'customers.view')));
create policy "training_attendance_business_team_read" on public.training_course_attendance for select to authenticated
  using (exists (select 1 from public.training_course_enrollments enrollment join public.training_courses course on course.id = enrollment.course_id where enrollment.id = enrollment_id and public.business_profile_has_permission(course.business_profile_id, 'trainings.attendance')));
create policy "training_pass_products_business_team_read" on public.training_pass_products for select to authenticated
  using (business_profile_id is not null and public.business_profile_has_permission(business_profile_id, 'passes.manage'));
create policy "training_passes_business_team_read" on public.training_passes for select to authenticated
  using (exists (select 1 from public.training_pass_products product where product.id = product_id and public.business_profile_has_permission(product.business_profile_id, 'passes.manage')));
create policy "training_pass_usages_business_team_read" on public.training_pass_usages for select to authenticated
  using (exists (select 1 from public.training_passes pass join public.training_pass_products product on product.id = pass.product_id where pass.id = pass_id and public.business_profile_has_permission(product.business_profile_id, 'passes.manage')));
create policy "training_commerce_payments_business_team_read" on public.training_commerce_payments for select to authenticated
  using (business_profile_id is not null and public.business_profile_has_permission(business_profile_id, 'payments.view'));
create policy "trainer_date_availability_business_team_read" on public.trainer_date_availability for select to authenticated
  using (business_profile_id is not null and public.business_profile_has_permission(business_profile_id, 'trainings.schedule'));
create policy "training_bookings_business_team_read" on public.training_bookings for select to authenticated
  using (business_profile_id is not null and (
    public.business_profile_has_permission(business_profile_id, 'trainings.bookings')
    or public.business_profile_has_permission(business_profile_id, 'customers.view')
  ));
create policy "training_payments_business_team_read" on public.training_payments for select to authenticated
  using (business_profile_id is not null and public.business_profile_has_permission(business_profile_id, 'payments.view'));
create policy "event_payments_business_team_read" on public.event_payments for select to authenticated
  using (business_profile_id is not null and public.business_profile_has_permission(business_profile_id, 'payments.view'));
create policy "training_pass_requests_business_team_read" on public.training_pass_requests for select to authenticated
  using (exists (
    select 1 from public.training_passes pass
    join public.training_pass_products product on product.id = pass.product_id
    where pass.id = pass_id and public.business_profile_has_permission(product.business_profile_id, 'passes.manage')
  ));
