alter table public.event_payments
  add column if not exists refunded_amount numeric(10, 2) not null default 0 check (refunded_amount >= 0 and refunded_amount <= amount),
  add column if not exists stripe_charge_id text,
  add column if not exists receipt_url text,
  add column if not exists failure_code text,
  add column if not exists failure_message text,
  add column if not exists last_reconciled_at timestamptz,
  add column if not exists reconciliation_status text not null default 'not_checked'
    check (reconciliation_status in ('not_checked', 'ok', 'attention', 'error')),
  add column if not exists reconciliation_error text;

create table if not exists public.event_refunds (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.event_payments(id) on delete restrict,
  registration_id uuid not null references public.registrations(id) on delete restrict,
  requested_by uuid references auth.users(id) on delete set null,
  cancellation_request_id uuid references public.cancellation_requests(id) on delete set null,
  amount numeric(10, 2) not null check (amount > 0),
  currency text not null default 'PLN' check (currency ~ '^[A-Z]{3}$'),
  status text not null default 'pending'
    check (status in ('pending', 'requires_action', 'succeeded', 'failed', 'canceled')),
  stripe_refund_id text,
  requested_dates jsonb,
  new_form_data jsonb not null default '{}'::jsonb,
  cancel_registration boolean not null default false,
  reason text not null default 'requested_by_customer',
  error_code text,
  error_message text,
  notification_sent_at timestamptz,
  failure_notification_sent_at timestamptz,
  attempt_count integer not null default 1 check (attempt_count > 0),
  last_reconciled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.event_refund_attempts (
  id uuid primary key default gen_random_uuid(),
  refund_id uuid not null references public.event_refunds(id) on delete cascade,
  attempt_number integer not null check (attempt_number > 0),
  stripe_refund_id text,
  status text not null default 'pending',
  error_code text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (refund_id, attempt_number),
  unique (stripe_refund_id)
);

create table if not exists public.event_refund_items (
  id uuid primary key default gen_random_uuid(),
  refund_id uuid not null references public.event_refunds(id) on delete cascade,
  payment_item_id uuid not null references public.event_payment_items(id) on delete restrict,
  amount numeric(10, 2) not null check (amount > 0),
  created_at timestamptz not null default now(),
  unique (refund_id, payment_item_id),
  unique (payment_item_id)
);

create unique index if not exists event_refunds_stripe_refund_key
  on public.event_refunds(stripe_refund_id) where stripe_refund_id is not null;
create unique index if not exists event_refunds_cancellation_request_key
  on public.event_refunds(cancellation_request_id) where cancellation_request_id is not null;
create index if not exists idx_event_refunds_payment on public.event_refunds(payment_id, created_at desc);
create index if not exists idx_event_refunds_status on public.event_refunds(status, created_at);

alter table public.event_refunds enable row level security;
alter table public.event_refund_items enable row level security;
alter table public.event_refund_attempts enable row level security;

create policy "event_refunds_owner_or_manager_read"
  on public.event_refunds for select to authenticated
  using (
    exists (
      select 1 from public.event_payments payment
      where payment.id = event_refunds.payment_id
        and (
          payment.payer_user_id = auth.uid()
          or payment.payee_user_id = auth.uid()
          or exists (
            select 1 from public.registrations registration
            where registration.id = payment.registration_id
              and (public.is_participant_owner(registration.participant_id) or public.is_event_manager(registration.event_id))
          )
        )
    )
  );

create policy "event_refund_items_owner_or_manager_read"
  on public.event_refund_items for select to authenticated
  using (
    exists (
      select 1 from public.event_refunds refund
      join public.event_payments payment on payment.id = refund.payment_id
      where refund.id = event_refund_items.refund_id
        and (
          payment.payer_user_id = auth.uid()
          or payment.payee_user_id = auth.uid()
          or exists (
            select 1 from public.registrations registration
            where registration.id = payment.registration_id
              and (public.is_participant_owner(registration.participant_id) or public.is_event_manager(registration.event_id))
          )
        )
    )
  );

create policy "event_refund_attempts_owner_or_manager_read"
  on public.event_refund_attempts for select to authenticated
  using (exists (
    select 1 from public.event_refunds refund
    join public.event_payments payment on payment.id = refund.payment_id
    where refund.id = event_refund_attempts.refund_id
      and (payment.payer_user_id = auth.uid() or payment.payee_user_id = auth.uid())
  ));

grant select on public.event_refunds, public.event_refund_items, public.event_refund_attempts to authenticated;
grant all on public.event_refunds, public.event_refund_items, public.event_refund_attempts to service_role;

create or replace function public.complete_event_refund(target_refund_id uuid, target_stripe_refund_id text)
returns table (registration_id uuid, payment_id uuid, notification_required boolean)
language plpgsql security definer set search_path = public
as $$
declare
  current_refund public.event_refunds%rowtype;
  current_payment public.event_payments%rowtype;
  should_notify boolean := false;
  refunded_total numeric(10, 2);
begin
  select * into current_refund from public.event_refunds where id = target_refund_id for update;
  if current_refund.id is null then raise exception using message = 'event_refund_not_found'; end if;
  if current_refund.stripe_refund_id is not null and current_refund.stripe_refund_id <> target_stripe_refund_id then
    raise exception using message = 'event_refund_id_mismatch';
  end if;
  if current_refund.status not in ('pending', 'requires_action', 'succeeded') then
    raise exception using message = 'event_refund_invalid_state';
  end if;
  should_notify := current_refund.status <> 'succeeded';

  select * into current_payment from public.event_payments where id = current_refund.payment_id for update;
  update public.event_refunds set status = 'succeeded', stripe_refund_id = target_stripe_refund_id,
    error_code = null, error_message = null, last_reconciled_at = now(), updated_at = now()
  where id = target_refund_id;

  update public.event_payment_items payment_item
  set refunded_amount = least(payment_item.amount, payment_item.refunded_amount + refund_item.amount)
  from public.event_refund_items refund_item
  where refund_item.refund_id = target_refund_id and refund_item.payment_item_id = payment_item.id;

  update public.event_registration_items registration_item
  set status = 'refunded', updated_at = now()
  from public.event_payment_items payment_item, public.event_refund_items refund_item
  where refund_item.refund_id = target_refund_id
    and refund_item.payment_item_id = payment_item.id
    and payment_item.registration_item_id = registration_item.id
    and payment_item.refunded_amount >= payment_item.amount;

  select coalesce(sum(amount), 0) into refunded_total
  from public.event_refunds where payment_id = current_refund.payment_id and status = 'succeeded';
  update public.event_payments
  set refunded_amount = least(amount, refunded_total),
      status = case when refunded_total >= amount then 'refunded' else 'partially_refunded' end,
      reconciliation_status = 'ok', reconciliation_error = null, last_reconciled_at = now(), updated_at = now()
  where id = current_refund.payment_id;

  update public.registrations
  set form_data = current_refund.new_form_data,
      status = case when current_refund.cancel_registration then 'cancelled' else 'confirmed' end
  where id = current_refund.registration_id;

  if current_refund.cancellation_request_id is not null then
    update public.cancellation_requests
    set status = 'accepted', processed_at = now(), processed_by = coalesce(processed_by, current_refund.requested_by)
    where id = current_refund.cancellation_request_id and status = 'pending';
  end if;
  return query select current_refund.registration_id, current_refund.payment_id, should_notify;
end;
$$;

create or replace function public.fail_event_refund(
  target_refund_id uuid, target_stripe_refund_id text, target_status text,
  target_error_code text default null, target_error_message text default null
)
returns boolean language plpgsql security definer set search_path = public
as $$
begin
  if target_status not in ('failed', 'canceled', 'requires_action', 'pending') then return false; end if;
  update public.event_refunds
  set status = target_status,
      stripe_refund_id = coalesce(stripe_refund_id, target_stripe_refund_id),
      error_code = target_error_code, error_message = target_error_message,
      last_reconciled_at = now(), updated_at = now()
  where id = target_refund_id and status <> 'succeeded'
    and (stripe_refund_id is null or stripe_refund_id = target_stripe_refund_id);
  return found;
end;
$$;

revoke all on function public.complete_event_refund(uuid, text) from public, anon, authenticated;
revoke all on function public.fail_event_refund(uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.complete_event_refund(uuid, text) to service_role;
grant execute on function public.fail_event_refund(uuid, text, text, text, text) to service_role;
