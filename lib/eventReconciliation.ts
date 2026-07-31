import Stripe from 'stripe'
import { createServerClient } from '@/lib/supabaseServer'
import { retryEventRefund } from '@/lib/eventRefund'
import { sendRegistrationEmail } from '@/lib/email'

const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null

function one<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null
}

async function notifyConfirmedPayment(paymentId: string, registrationId: string) {
  const db = createServerClient()
  const { data: claimed } = await db.from('event_payments')
    .update({ confirmation_sent_at: new Date().toISOString() })
    .eq('id', paymentId).is('confirmation_sent_at', null).select('id').maybeSingle()
  if (!claimed) return
  const { data: registration } = await db.from('registrations')
    .select('form_data, participants(owner_email, owner_name, dog_name), events(title, start_at, location, form_fields)')
    .eq('id', registrationId).maybeSingle()
  const participant = one(registration?.participants)
  const event = one(registration?.events)
  if (!participant?.owner_email || !event) return
  await sendRegistrationEmail({
    to: participant.owner_email,
    ownerName: participant.owner_name ?? '',
    dogName: participant.dog_name ?? '',
    eventTitle: event.title,
    eventDate: event.start_at,
    eventLocation: event.location,
    status: 'confirmed',
    formFields: Array.isArray(event.form_fields) ? event.form_fields : [],
    formData: registration?.form_data ?? {},
  })
}

export async function reconcileEventPayments(payeeUserId?: string) {
  if (!stripe) throw new Error('Stripe nie jest skonfigurowany')
  const db = createServerClient()
  let paymentQuery = db.from('event_payments')
    .select('id, registration_id, status, amount, refunded_amount, stripe_session_id, stripe_payment_intent_id, stripe_account_id')
    .in('status', ['pending', 'completed', 'partially_refunded', 'refunded'])
    .order('last_reconciled_at', { ascending: true, nullsFirst: true }).limit(200)
  if (payeeUserId) paymentQuery = paymentQuery.eq('payee_user_id', payeeUserId)
  const { data: payments, error } = await paymentQuery
  if (error) throw error

  const result = { checked: 0, completed: 0, expired: 0, corrected: 0, attention: 0, errors: 0, refunds: 0 }
  for (const payment of payments ?? []) {
    result.checked += 1
    try {
      if (payment.status === 'pending') {
        if (!payment.stripe_session_id) throw new Error('Brak identyfikatora sesji Checkout')
        const session = await stripe.checkout.sessions.retrieve(payment.stripe_session_id, {
          stripeAccount: payment.stripe_account_id,
        })
        const paymentIntentId = typeof session.payment_intent === 'string'
          ? session.payment_intent
          : session.payment_intent?.id
        if (session.status === 'complete' && session.payment_status === 'paid' && paymentIntentId) {
          const { data: transition, error: transitionError } = await db.rpc('complete_event_checkout', {
            target_payment_id: payment.id,
            target_session_id: session.id,
            target_payment_intent_id: paymentIntentId,
          })
          if (transitionError) throw transitionError
          const row = Array.isArray(transition) ? transition[0] : transition
          if (row?.notification_required) await notifyConfirmedPayment(payment.id, payment.registration_id)
          result.completed += 1
        } else if (session.status === 'expired') {
          const { error: expireError } = await db.rpc('fail_event_checkout', {
            target_payment_id: payment.id,
            target_session_id: session.id,
          })
          if (expireError) throw expireError
          result.expired += 1
        }
      }

      const intentId = payment.stripe_payment_intent_id
      if (intentId) {
        const intent = await stripe.paymentIntents.retrieve(intentId, { expand: ['latest_charge'] }, {
          stripeAccount: payment.stripe_account_id,
        })
        const charge = typeof intent.latest_charge === 'string' ? null : intent.latest_charge
        const stripeRefunded = charge?.amount_refunded ?? 0
        const localRefunded = Math.round(Number(payment.refunded_amount ?? 0) * 100)
        const correctedStatus = stripeRefunded >= Math.round(Number(payment.amount) * 100)
          ? 'refunded'
          : stripeRefunded > 0 ? 'partially_refunded' : 'completed'
        const mismatch = stripeRefunded !== localRefunded
        await db.from('event_payments').update({
          status: correctedStatus,
          refunded_amount: stripeRefunded / 100,
          stripe_charge_id: charge?.id ?? null,
          receipt_url: charge?.receipt_url ?? null,
          reconciliation_status: mismatch ? 'attention' : 'ok',
          reconciliation_error: mismatch
            ? 'Stan zwrotów w Stripe różnił się od Dogdex. Kwota została uzgodniona; sprawdź przypisanie do terminów.'
            : null,
          last_reconciled_at: new Date().toISOString(),
        }).eq('id', payment.id)
        if (mismatch) {
          result.corrected += 1
          result.attention += 1
        }
      } else {
        await db.from('event_payments').update({
          reconciliation_status: payment.status === 'pending' ? 'ok' : 'attention',
          reconciliation_error: payment.status === 'pending' ? null : 'Brak PaymentIntent dla zakończonej płatności',
          last_reconciled_at: new Date().toISOString(),
        }).eq('id', payment.id)
        if (payment.status !== 'pending') result.attention += 1
      }
    } catch (caught) {
      result.errors += 1
      const message = caught instanceof Error ? caught.message : 'Nieznany błąd uzgadniania'
      await db.from('event_payments').update({
        reconciliation_status: 'error', reconciliation_error: message,
        last_reconciled_at: new Date().toISOString(),
      }).eq('id', payment.id)
    }
  }

  let refundQuery = db.from('event_refunds')
    .select('id, event_payments!inner(payee_user_id)')
    .in('status', ['pending', 'requires_action']).limit(100)
  if (payeeUserId) refundQuery = refundQuery.eq('event_payments.payee_user_id', payeeUserId)
  const { data: refunds } = await refundQuery
  for (const refund of refunds ?? []) {
    try {
      await retryEventRefund(refund.id)
      result.refunds += 1
    } catch {
      result.errors += 1
    }
  }
  return result
}
