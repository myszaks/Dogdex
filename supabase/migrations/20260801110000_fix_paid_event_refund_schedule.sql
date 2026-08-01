-- Paid event refunds update registrations atomically. Keep schedule assignments
-- in the same transaction so a refunded/cancelled participant cannot remain in
-- the organizer's schedule or retain access through a stale assignment.

create or replace function public.complete_event_refund(target_refund_id uuid, target_stripe_refund_id text)
returns table (registration_id uuid, payment_id uuid, notification_required boolean)
language plpgsql security definer set search_path = public
as $$
declare
  current_refund public.event_refunds%rowtype;
  current_payment public.event_payments%rowtype;
  should_notify boolean := false;
  refunded_total numeric(10, 2);
  refunded_dates text[] := array[]::text[];
begin
  select * into current_refund from public.event_refunds where id = target_refund_id for update;
  if current_refund.id is null then raise exception using message = 'event_refund_not_found'; end if;
  if current_refund.stripe_refund_id is not null and current_refund.stripe_refund_id <> target_stripe_refund_id then
    raise exception using message = 'event_refund_id_mismatch';
  end if;
  if current_refund.status not in ('pending', 'requires_action', 'succeeded') then
    raise exception using message = 'event_refund_invalid_state';
  end if;

  if current_refund.requested_dates is not null then
    select coalesce(array_agg(date_value), array[]::text[])
    into refunded_dates
    from jsonb_array_elements_text(current_refund.requested_dates) as refunded_date(date_value);
  end if;

  if current_refund.cancel_registration then
    delete from public.schedule_assignments assignment
    where assignment.registration_id = current_refund.registration_id;
  elsif cardinality(refunded_dates) > 0 then
    delete from public.schedule_assignments assignment
    using public.time_slots slot
    where assignment.registration_id = current_refund.registration_id
      and assignment.time_slot_id = slot.id
      and (
        assignment.item_date = any(refunded_dates)
        or slot.slot_date::text = any(refunded_dates)
      );
  end if;

  -- Stripe webhooks and reconciliation may replay the same successful refund.
  -- Schedule cleanup above remains idempotent, while financial amounts must not
  -- be applied twice.
  if current_refund.status = 'succeeded' then
    return query select current_refund.registration_id, current_refund.payment_id, false;
    return;
  end if;
  should_notify := true;

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

  select coalesce(sum(refund_row.amount), 0) into refunded_total
  from public.event_refunds refund_row
  where refund_row.payment_id = current_refund.payment_id and refund_row.status = 'succeeded';
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

revoke all on function public.complete_event_refund(uuid, text) from public, anon, authenticated;
grant execute on function public.complete_event_refund(uuid, text) to service_role;

-- Repair artifacts created before the atomic cleanup was introduced.
delete from public.schedule_assignments assignment
using public.registrations registration
where assignment.registration_id = registration.id
  and registration.status = 'cancelled';

delete from public.schedule_assignments assignment
using public.registrations registration
where assignment.registration_id = registration.id
  and assignment.item_date <> ''
  and not exists (
    select 1
    from jsonb_each(coalesce(registration.form_data, '{}'::jsonb)) field
    cross join lateral jsonb_array_elements_text(
      case when jsonb_typeof(field.value) = 'array' then field.value else '[]'::jsonb end
    ) selected_date
    where selected_date.value = assignment.item_date
  );
