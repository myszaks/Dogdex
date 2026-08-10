-- Customer self-service for courses and passes, with trainer-controlled entitlement changes.

alter table public.training_courses
  add column if not exists cancellation_policy text
    check (cancellation_policy is null or char_length(cancellation_policy) <= 3000),
  add column if not exists participant_message text
    check (participant_message is null or char_length(participant_message) <= 2000);

alter table public.training_pass_products
  add column if not exists cancellation_policy text
    check (cancellation_policy is null or char_length(cancellation_policy) <= 3000),
  add column if not exists freeze_policy text
    check (freeze_policy is null or char_length(freeze_policy) <= 2000);

alter table public.training_course_enrollments
  add column if not exists policy_accepted_at timestamptz,
  add column if not exists policy_snapshot text
    check (policy_snapshot is null or char_length(policy_snapshot) <= 3000);

alter table public.training_passes
  add column if not exists policy_accepted_at timestamptz,
  add column if not exists policy_snapshot text
    check (policy_snapshot is null or char_length(policy_snapshot) <= 5000);

alter table public.training_commerce_payments
  add column if not exists receipt_url text,
  add column if not exists last_reconciled_at timestamptz;

create table if not exists public.training_pass_requests (
  id uuid primary key default gen_random_uuid(),
  pass_id uuid not null references public.training_passes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  request_type text not null check (request_type in ('freeze', 'extend')),
  requested_days integer check (
    (request_type = 'freeze' and requested_days is null)
    or (request_type = 'extend' and requested_days between 1 and 730)
  ),
  reason text not null check (char_length(reason) between 3 and 1000),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  response_note text check (response_note is null or char_length(response_note) <= 1000),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists training_pass_requests_one_pending_type
  on public.training_pass_requests(pass_id, request_type)
  where status = 'pending';
create index if not exists idx_training_pass_requests_user
  on public.training_pass_requests(user_id, created_at desc);
create index if not exists idx_training_pass_requests_status
  on public.training_pass_requests(status, created_at);

drop trigger if exists training_pass_requests_updated_at on public.training_pass_requests;
create trigger training_pass_requests_updated_at before update on public.training_pass_requests
  for each row execute function public.update_updated_at_column();

alter table public.training_pass_requests enable row level security;
create policy "training_pass_requests_parties_read" on public.training_pass_requests
  for select to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1
      from public.training_passes pass
      join public.training_pass_products product on product.id = pass.product_id
      where pass.id = pass_id and product.trainer_id = auth.uid()
    )
    or public.user_role() = 'admin'
  );

grant select on public.training_pass_requests to authenticated;
grant all on public.training_pass_requests to service_role;

create or replace function public.resolve_training_pass_request(
  target_request_id uuid,
  target_trainer_id uuid,
  approve_request boolean,
  target_response_note text
)
returns public.training_pass_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_request public.training_pass_requests%rowtype;
  current_pass public.training_passes%rowtype;
  current_product public.training_pass_products%rowtype;
  result public.training_pass_requests%rowtype;
  next_expiry date;
begin
  select * into current_request
  from public.training_pass_requests
  where id = target_request_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'training_pass_request_not_found';
  end if;
  if current_request.status <> 'pending' then
    raise exception using errcode = 'P0001', message = 'training_pass_request_already_resolved';
  end if;

  select * into current_pass from public.training_passes where id = current_request.pass_id for update;
  select * into current_product from public.training_pass_products where id = current_pass.product_id;
  if current_product.trainer_id <> target_trainer_id then
    raise exception using errcode = '42501', message = 'training_pass_request_forbidden';
  end if;

  if approve_request then
    if current_request.request_type = 'freeze' then
      if current_pass.status <> 'active' then
        raise exception using errcode = 'P0001', message = 'training_pass_not_active';
      end if;
      update public.training_passes
      set status = 'frozen', frozen_at = now(), updated_at = now()
      where id = current_pass.id;
      insert into public.training_pass_adjustments(
        pass_id, actor_id, action, previous_expires_at, next_expires_at, note
      ) values (
        current_pass.id, target_trainer_id, 'freeze', current_pass.expires_at,
        current_pass.expires_at, coalesce(nullif(target_response_note, ''), current_request.reason)
      );
    else
      if current_pass.status not in ('active', 'frozen', 'expired') then
        raise exception using errcode = 'P0001', message = 'training_pass_cannot_be_extended';
      end if;
      next_expiry := greatest(coalesce(current_pass.expires_at, current_date), current_date)
        + current_request.requested_days;
      update public.training_passes
      set expires_at = next_expiry,
          status = case when status = 'expired' and entries_remaining > 0 then 'active' else status end,
          expiry_notification_sent_at = null,
          updated_at = now()
      where id = current_pass.id;
      insert into public.training_pass_adjustments(
        pass_id, actor_id, action, previous_expires_at, next_expires_at, note
      ) values (
        current_pass.id, target_trainer_id, 'extend', current_pass.expires_at,
        next_expiry, coalesce(nullif(target_response_note, ''), current_request.reason)
      );
    end if;
  end if;

  update public.training_pass_requests
  set status = case when approve_request then 'approved' else 'rejected' end,
      response_note = nullif(left(coalesce(target_response_note, ''), 1000), ''),
      reviewed_by = target_trainer_id,
      reviewed_at = now(),
      updated_at = now()
  where id = current_request.id
  returning * into result;
  return result;
end;
$$;

revoke all on function public.resolve_training_pass_request(uuid, uuid, boolean, text) from public;
grant execute on function public.resolve_training_pass_request(uuid, uuid, boolean, text) to service_role;
