alter table public.events
  add column if not exists pricing_mode text not null default 'free',
  add column if not exists date_prices jsonb not null default '{}'::jsonb,
  add column if not exists currency text not null default 'PLN';

alter table public.events
  drop constraint if exists events_pricing_mode_check;
alter table public.events
  add constraint events_pricing_mode_check
  check (pricing_mode in ('free', 'flat', 'per_date'));

alter table public.events
  drop constraint if exists events_currency_check;
alter table public.events
  add constraint events_currency_check
  check (currency ~ '^[A-Z]{3}$');

alter table public.registrations
  add column if not exists payment_expires_at timestamptz,
  add column if not exists approved_at timestamptz;

create table if not exists public.event_registration_items (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null references public.registrations(id) on delete cascade,
  item_key text not null,
  kind text not null check (kind in ('entry', 'date')),
  form_field_id text,
  occurrence_date date,
  label text not null,
  amount numeric(10, 2) not null check (amount > 0),
  currency text not null default 'PLN' check (currency ~ '^[A-Z]{3}$'),
  status text not null default 'pending_approval'
    check (status in ('pending_approval', 'pending_payment', 'paid', 'cancelled', 'refunded')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (registration_id, item_key)
);

create table if not exists public.event_payments (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null references public.registrations(id) on delete cascade,
  payee_user_id uuid not null references auth.users(id) on delete restrict,
  payer_user_id uuid references auth.users(id) on delete set null,
  payer_email text not null,
  amount numeric(10, 2) not null check (amount > 0),
  currency text not null default 'PLN' check (currency ~ '^[A-Z]{3}$'),
  status text not null default 'pending'
    check (status in ('pending', 'completed', 'failed', 'partially_refunded', 'refunded')),
  stripe_session_id text,
  stripe_payment_intent_id text,
  stripe_account_id text not null,
  checkout_token uuid not null default gen_random_uuid(),
  checkout_url text,
  expires_at timestamptz,
  confirmation_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.event_payment_items (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.event_payments(id) on delete cascade,
  registration_item_id uuid not null references public.event_registration_items(id) on delete restrict,
  amount numeric(10, 2) not null check (amount > 0),
  refunded_amount numeric(10, 2) not null default 0 check (refunded_amount >= 0 and refunded_amount <= amount),
  created_at timestamptz not null default now(),
  unique (payment_id, registration_item_id)
);

create unique index if not exists event_payments_checkout_token_key
  on public.event_payments(checkout_token);
create unique index if not exists event_payments_stripe_session_key
  on public.event_payments(stripe_session_id)
  where stripe_session_id is not null;
create unique index if not exists event_payments_stripe_payment_intent_key
  on public.event_payments(stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;
create index if not exists idx_event_registration_items_registration
  on public.event_registration_items(registration_id);
create index if not exists idx_event_payments_registration
  on public.event_payments(registration_id, created_at desc);
create index if not exists idx_event_payments_payee
  on public.event_payments(payee_user_id, created_at desc);

alter table public.event_registration_items enable row level security;
alter table public.event_payments enable row level security;
alter table public.event_payment_items enable row level security;

create policy "event_registration_items_owner_or_manager_read"
  on public.event_registration_items for select to authenticated
  using (
    exists (
      select 1
      from public.registrations registration
      where registration.id = event_registration_items.registration_id
        and (
          public.is_participant_owner(registration.participant_id)
          or public.is_event_manager(registration.event_id)
        )
    )
  );

create policy "event_payments_owner_or_manager_read"
  on public.event_payments for select to authenticated
  using (
    payer_user_id = auth.uid()
    or payee_user_id = auth.uid()
    or exists (
      select 1
      from public.registrations registration
      where registration.id = event_payments.registration_id
        and (
          public.is_participant_owner(registration.participant_id)
          or public.is_event_manager(registration.event_id)
        )
    )
  );

create policy "event_payment_items_owner_or_manager_read"
  on public.event_payment_items for select to authenticated
  using (
    exists (
      select 1
      from public.event_payments payment
      where payment.id = event_payment_items.payment_id
        and (
          payment.payer_user_id = auth.uid()
          or payment.payee_user_id = auth.uid()
          or exists (
            select 1
            from public.registrations registration
            where registration.id = payment.registration_id
              and (
                public.is_participant_owner(registration.participant_id)
                or public.is_event_manager(registration.event_id)
              )
          )
        )
    )
  );

grant select on public.event_registration_items to authenticated;
grant select on public.event_payments to authenticated;
grant select on public.event_payment_items to authenticated;
grant all on public.event_registration_items to service_role;
grant all on public.event_payments to service_role;
grant all on public.event_payment_items to service_role;

create or replace function public.complete_event_checkout(
  target_payment_id uuid,
  target_session_id text,
  target_payment_intent_id text
)
returns table (registration_id uuid, notification_required boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_payment public.event_payments%rowtype;
  should_notify boolean := false;
begin
  select * into current_payment
  from public.event_payments
  where id = target_payment_id
  for update;

  if current_payment.id is null then
    raise exception using message = 'event_payment_not_found';
  end if;
  if current_payment.stripe_session_id is not null
    and current_payment.stripe_session_id <> target_session_id then
    raise exception using message = 'event_payment_session_mismatch';
  end if;
  if current_payment.status not in ('pending', 'completed') then
    raise exception using message = 'event_payment_invalid_state';
  end if;

  should_notify := current_payment.status = 'pending';

  update public.event_payments
  set status = 'completed',
      stripe_session_id = target_session_id,
      stripe_payment_intent_id = target_payment_intent_id,
      expires_at = null,
      updated_at = now()
  where id = target_payment_id;

  update public.event_registration_items item
  set status = 'paid', updated_at = now()
  from public.event_payment_items payment_item
  where payment_item.payment_id = target_payment_id
    and payment_item.registration_item_id = item.id
    and item.status in ('pending_approval', 'pending_payment', 'paid');

  update public.registrations
  set status = 'confirmed',
      payment_expires_at = null,
      approved_at = coalesce(approved_at, now())
  where id = current_payment.registration_id
    and status = 'pending';

  return query select current_payment.registration_id, should_notify;
end;
$$;

create or replace function public.fail_event_checkout(
  target_payment_id uuid,
  target_session_id text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  current_payment public.event_payments%rowtype;
begin
  select * into current_payment
  from public.event_payments
  where id = target_payment_id
  for update;

  if current_payment.id is null then return false; end if;
  if current_payment.stripe_session_id is not null
    and current_payment.stripe_session_id <> target_session_id then
    return false;
  end if;
  if current_payment.status <> 'pending' then return false; end if;

  update public.event_payments
  set status = 'failed', expires_at = null, updated_at = now()
  where id = target_payment_id;

  update public.event_registration_items item
  set status = 'cancelled', updated_at = now()
  from public.event_payment_items payment_item
  where payment_item.payment_id = target_payment_id
    and payment_item.registration_item_id = item.id
    and item.status in ('pending_approval', 'pending_payment');

  update public.registrations
  set status = 'cancelled', payment_expires_at = null
  where id = current_payment.registration_id
    and status = 'pending';

  return true;
end;
$$;

revoke all on function public.complete_event_checkout(uuid, text, text) from public, anon, authenticated;
revoke all on function public.fail_event_checkout(uuid, text) from public, anon, authenticated;
grant execute on function public.complete_event_checkout(uuid, text, text) to service_role;
grant execute on function public.fail_event_checkout(uuid, text) to service_role;
