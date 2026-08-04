import Stripe from 'stripe'
import { createServerClient } from '@/lib/supabaseServer'
import { sendEventRefundResultEmail } from '@/lib/email'
import { buildEventRefundPlan } from '@/lib/eventRefundPlanning'
import { tryProcessEventWaitlist } from '@/lib/eventWaitlist'

const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null

type RefundStatus = 'pending' | 'requires_action' | 'succeeded' | 'failed' | 'canceled'

interface CreateEventRefundInput {
  registrationId: string
  cancelledDates: string[] | null
  requestedBy: string
  cancellationRequestId?: string | null
}

function one<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null
}

function stripeRefundStatus(value: string): RefundStatus {
  return ['pending', 'requires_action', 'succeeded', 'failed', 'canceled'].includes(value)
    ? value as RefundStatus
    : 'pending'
}

export async function sendEventRefundNotification(refundId: string, succeeded: boolean): Promise<void> {
  const db = createServerClient()
  const claimColumn = succeeded ? 'notification_sent_at' : 'failure_notification_sent_at'
  const { data: claimed } = await db.from('event_refunds')
    .update({ [claimColumn]: new Date().toISOString() })
    .eq('id', refundId)
    .is(claimColumn, null)
    .select('id, amount, currency, requested_dates, error_message, registration_id')
    .maybeSingle()
  if (!claimed) return

  const { data: registration } = await db.from('registrations')
    .select('participants(owner_email, owner_name, dog_name), events(title, created_by)')
    .eq('id', claimed.registration_id).maybeSingle()
  const participant = one(registration?.participants)
  const event = one(registration?.events)
  if (!participant?.owner_email || !event) return
  const { data: organizerUser } = event.created_by
    ? await db.auth.admin.getUserById(event.created_by)
    : { data: { user: null } }
  await sendEventRefundResultEmail({
    to: participant.owner_email,
    organizerEmail: organizerUser.user?.email,
    ownerName: participant.owner_name ?? '',
    dogName: participant.dog_name ?? '',
    eventTitle: event.title,
    amount: Number(claimed.amount),
    currency: claimed.currency,
    refundedDates: Array.isArray(claimed.requested_dates) ? claimed.requested_dates as string[] : null,
    succeeded,
    errorMessage: claimed.error_message,
  })
}

export async function applyStripeRefundStatus(
  refundId: string,
  refund: Pick<Stripe.Refund, 'id' | 'status' | 'failure_reason'>,
): Promise<RefundStatus> {
  const db = createServerClient()
  const status = stripeRefundStatus(refund.status ?? 'pending')
  await db.from('event_refund_attempts').update({
    stripe_refund_id: refund.id,
    status,
    error_code: refund.failure_reason ?? null,
    error_message: refund.failure_reason ?? null,
    updated_at: new Date().toISOString(),
  }).eq('refund_id', refundId).eq('stripe_refund_id', refund.id)
  if (status === 'succeeded') {
    const { data, error } = await db.rpc('complete_event_refund', {
      target_refund_id: refundId,
      target_stripe_refund_id: refund.id,
    })
    if (error) throw error
    const transition = Array.isArray(data) ? data[0] : data
    if (transition?.notification_required) await sendEventRefundNotification(refundId, true)
    if (transition?.registration_id) {
      const { data: releasedRegistration } = await db
        .from('registrations')
        .select('event_id, status')
        .eq('id', transition.registration_id)
        .maybeSingle()
      if (releasedRegistration?.status === 'cancelled') {
        await tryProcessEventWaitlist(releasedRegistration.event_id)
      }
    }
    return status
  }

  const errorMessage = refund.failure_reason || (status === 'requires_action'
    ? 'Stripe wymaga dodatkowej czynności'
    : status === 'failed' || status === 'canceled' ? 'Stripe nie zrealizował zwrotu' : null)
  const { error } = await db.rpc('fail_event_refund', {
    target_refund_id: refundId,
    target_stripe_refund_id: refund.id,
    target_status: status,
    target_error_code: refund.failure_reason ?? null,
    target_error_message: errorMessage,
  })
  if (error) throw error
  if (status === 'failed' || status === 'canceled' || status === 'requires_action') {
    await sendEventRefundNotification(refundId, false)
  }
  return status
}

export async function createEventRefund(input: CreateEventRefundInput) {
  if (!stripe) throw new Error('Płatności nie są skonfigurowane')
  const db = createServerClient()
  const { data: registration, error: registrationError } = await db.from('registrations')
    .select('id, status, form_data, participants(owner_email), events(id, title, form_fields)')
    .eq('id', input.registrationId).maybeSingle()
  if (registrationError || !registration) throw registrationError ?? new Error('Nie znaleziono zapisu')

  const { data: payment, error: paymentError } = await db.from('event_payments')
    .select('id, amount, currency, status, stripe_payment_intent_id, stripe_account_id')
    .eq('registration_id', input.registrationId)
    .in('status', ['completed', 'partially_refunded'])
    .order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (paymentError || !payment?.stripe_payment_intent_id) {
    throw paymentError ?? new Error('Nie znaleziono opłaconej transakcji')
  }

  const { data: paymentItems, error: itemsError } = await db.from('event_payment_items')
    .select('id, amount, refunded_amount, event_registration_items(id, occurrence_date, form_field_id, label, status)')
    .eq('payment_id', payment.id)
  if (itemsError) throw itemsError

  const formData = (registration.form_data ?? {}) as Record<string, unknown>
  const event = one(registration.events)
  const multidateIds = Array.isArray(event?.form_fields)
    ? event.form_fields.filter((field: { type?: string }) => field.type === 'multidate').map((field: { id: string }) => field.id)
    : []
  const plan = buildEventRefundPlan({
    cancelledDates: input.cancelledDates,
    formData,
    multidateFieldIds: multidateIds,
    paymentItems: (paymentItems ?? []).map(item => ({
      id: item.id,
      amount: Number(item.amount),
      refundedAmount: Number(item.refunded_amount ?? 0),
      occurrenceDate: one(item.event_registration_items)?.occurrence_date ?? null,
    })),
  })
  const { dates: normalizedDates, refundable, nextFormData, cancelRegistration, amountInCents } = plan

  const { data: refundRow, error: refundInsertError } = await db.from('event_refunds').insert({
    payment_id: payment.id,
    registration_id: input.registrationId,
    requested_by: input.requestedBy,
    cancellation_request_id: input.cancellationRequestId ?? null,
    amount: amountInCents / 100,
    currency: payment.currency,
    requested_dates: normalizedDates,
    new_form_data: nextFormData,
    cancel_registration: cancelRegistration,
    attempt_count: 1,
  }).select('id').single()
  if (refundInsertError || !refundRow) throw refundInsertError ?? new Error('Nie udało się zapisać zwrotu')

  const { error: allocationsError } = await db.from('event_refund_items').insert(refundable.map(item => ({
    refund_id: refundRow.id,
    payment_item_id: item.id,
    amount: (Math.round((item.amount - item.refundedAmount) * 100)) / 100,
  })))
  if (allocationsError) {
    await db.from('event_refunds').update({ status: 'failed', error_message: allocationsError.message }).eq('id', refundRow.id)
    throw new Error('Dla jednego z terminów istnieje już zwrot')
  }

  const { error: attemptError } = await db.from('event_refund_attempts').insert({
    refund_id: refundRow.id,
    attempt_number: 1,
  })
  if (attemptError) throw attemptError

  try {
    const stripeRefund = await stripe.refunds.create({
      payment_intent: payment.stripe_payment_intent_id,
      amount: amountInCents,
      reason: 'requested_by_customer',
      metadata: {
        payment_kind: 'event_registration',
        event_refund_id: refundRow.id,
        event_payment_id: payment.id,
        registration_id: input.registrationId,
      },
    }, {
      stripeAccount: payment.stripe_account_id,
      idempotencyKey: `event-refund-${refundRow.id}-attempt-1`,
    })
    await Promise.all([
      db.from('event_refunds').update({ stripe_refund_id: stripeRefund.id }).eq('id', refundRow.id),
      db.from('event_refund_attempts').update({ stripe_refund_id: stripeRefund.id }).eq('refund_id', refundRow.id).eq('attempt_number', 1),
    ])
    const status = await applyStripeRefundStatus(refundRow.id, stripeRefund)
    return { refundId: refundRow.id, status, amount: amountInCents / 100, cancelRegistration }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Nieznany błąd Stripe'
    await db.rpc('fail_event_refund', {
      target_refund_id: refundRow.id,
      target_stripe_refund_id: null,
      target_status: 'pending',
      target_error_code: 'stripe_request_error',
      target_error_message: message,
    })
    await db.from('event_refund_attempts').update({
      status: 'pending', error_code: 'stripe_request_error', error_message: message,
    }).eq('refund_id', refundRow.id).eq('attempt_number', 1)
    throw new Error(`Nie udało się zlecić zwrotu: ${message}`)
  }
}

export async function retryEventRefund(refundId: string) {
  if (!stripe) throw new Error('Płatności nie są skonfigurowane')
  const db = createServerClient()
  const { data: refund, error } = await db.from('event_refunds')
    .select('id, amount, status, stripe_refund_id, attempt_count, payment_id, registration_id, event_payments(stripe_payment_intent_id, stripe_account_id)')
    .eq('id', refundId).maybeSingle()
  if (error || !refund) throw error ?? new Error('Nie znaleziono zwrotu')
  const payment = one(refund.event_payments)
  if (!payment?.stripe_payment_intent_id) throw new Error('Brakuje PaymentIntent dla zwrotu')
  if (refund.status === 'succeeded') return { refundId, status: 'succeeded' as RefundStatus }

  if (refund.stripe_refund_id && (refund.status === 'pending' || refund.status === 'requires_action')) {
    const stripeRefund = await stripe.refunds.retrieve(refund.stripe_refund_id, {
      stripeAccount: payment.stripe_account_id,
    })
    const status = await applyStripeRefundStatus(refundId, stripeRefund)
    return { refundId, status }
  }

  const currentAttempt = Number(refund.attempt_count) || 1
  const attemptNumber = refund.status === 'pending' && !refund.stripe_refund_id
    ? currentAttempt
    : currentAttempt + 1
  if (attemptNumber !== currentAttempt) {
    const { data: claimed } = await db.from('event_refunds').update({
      attempt_count: attemptNumber,
      status: 'pending',
      stripe_refund_id: null,
      error_code: null,
      error_message: null,
      failure_notification_sent_at: null,
    }).eq('id', refundId).eq('attempt_count', currentAttempt).select('id').maybeSingle()
    if (!claimed) throw new Error('Zwrot jest już ponawiany w innym procesie')
    const { error: attemptInsertError } = await db.from('event_refund_attempts').insert({
      refund_id: refundId,
      attempt_number: attemptNumber,
    })
    if (attemptInsertError) throw attemptInsertError
  }

  try {
    const stripeRefund = await stripe.refunds.create({
      payment_intent: payment.stripe_payment_intent_id,
      amount: Math.round(Number(refund.amount) * 100),
      reason: 'requested_by_customer',
      metadata: {
        payment_kind: 'event_registration',
        event_refund_id: refundId,
        event_payment_id: refund.payment_id,
        registration_id: refund.registration_id,
      },
    }, {
      stripeAccount: payment.stripe_account_id,
      idempotencyKey: `event-refund-${refundId}-attempt-${attemptNumber}`,
    })
    await Promise.all([
      db.from('event_refunds').update({ stripe_refund_id: stripeRefund.id }).eq('id', refundId),
      db.from('event_refund_attempts').update({ stripe_refund_id: stripeRefund.id }).eq('refund_id', refundId).eq('attempt_number', attemptNumber),
    ])
    const status = await applyStripeRefundStatus(refundId, stripeRefund)
    return { refundId, status }
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : 'Nieznany błąd Stripe'
    await db.from('event_refund_attempts').update({
      status: 'failed', error_code: 'stripe_request_error', error_message: message,
    }).eq('refund_id', refundId).eq('attempt_number', attemptNumber)
    throw new Error(`Nie udało się ponowić zwrotu: ${message}`)
  }
}
