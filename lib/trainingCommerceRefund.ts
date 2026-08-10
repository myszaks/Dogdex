import Stripe from 'stripe'
import { createServerClient } from '@/lib/supabaseServer'
import { sendTrainingCommerceStatusEmail } from '@/lib/email'
import { notifyTrainingEnrollment } from '@/lib/trainingCommerceNotifications'

const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null

type RefundStatus = 'pending' | 'requires_action' | 'succeeded' | 'failed' | 'canceled'

function normalizeStatus(status: string | null): RefundStatus {
  return ['pending', 'requires_action', 'succeeded', 'failed', 'canceled'].includes(status ?? '')
    ? status as RefundStatus
    : 'pending'
}

export async function applyTrainingCommerceRefundStatus(refundId: string, refund: Pick<Stripe.Refund, 'id' | 'status' | 'failure_reason'>) {
  const db = createServerClient()
  const status = normalizeStatus(refund.status)
  if (status === 'succeeded') {
    const { data, error } = await db.rpc('complete_training_commerce_refund', {
      target_refund_id: refundId,
      target_stripe_refund_id: refund.id,
    })
    if (error) throw error
    const transition = Array.isArray(data) ? data[0] : data
    if (transition?.course_id) {
      const { data: promoted } = await db.rpc('promote_training_course_waitlist', { target_course_id: transition.course_id })
      const promotedEnrollment = Array.isArray(promoted) ? promoted[0] : promoted
      if (promotedEnrollment?.id) await notifyTrainingEnrollment(promotedEnrollment.id, 'promoted')
    }
  } else {
    const { error } = await db.from('training_commerce_refunds').update({
      status,
      stripe_refund_id: refund.id,
      error_message: refund.failure_reason ?? (status === 'requires_action' ? 'Stripe wymaga dodatkowej czynności' : null),
    }).eq('id', refundId)
    if (error) throw error
  }

  const { data: row } = await db.from('training_commerce_refunds')
    .select('amount, currency, training_commerce_payments(user_id, enrollment_id, pass_id)')
    .eq('id', refundId).maybeSingle()
  const payment = Array.isArray(row?.training_commerce_payments) ? row?.training_commerce_payments[0] : row?.training_commerce_payments
  if (payment?.user_id && ['succeeded', 'failed', 'canceled', 'requires_action'].includes(status)) {
    const { data: claimed } = await db.from('training_commerce_refunds')
      .update({ notification_sent_at: new Date().toISOString() })
      .eq('id', refundId).is('notification_sent_at', null).select('id').maybeSingle()
    if (!claimed) return status
    const { data: customer } = await db.auth.admin.getUserById(payment.user_id)
    if (customer.user?.email) {
      await sendTrainingCommerceStatusEmail({
        to: customer.user.email,
        title: status === 'succeeded' ? 'Zwrot płatności został wykonany' : 'Zwrot płatności wymaga uwagi',
        message: status === 'succeeded'
          ? `Stripe zwrócił ${Number(row?.amount).toLocaleString('pl-PL', { style: 'currency', currency: row?.currency ?? 'PLN' })}.`
          : 'Nie udało się automatycznie zakończyć zwrotu. Skontaktuj się z trenerem.',
      })
    }
  }
  return status
}

export async function createTrainingCommerceRefund(paymentId: string, requestedBy: string, reason?: string | null) {
  if (!stripe) throw new Error('Płatności nie są skonfigurowane')
  const db = createServerClient()
  const { data: payment, error } = await db.from('training_commerce_payments')
    .select('id, user_id, trainer_id, amount, currency, status, stripe_payment_intent_id, stripe_account_id, enrollment_id, pass_id, training_passes(entries_total, entries_remaining)')
    .eq('id', paymentId).maybeSingle()
  if (error || !payment) throw error ?? new Error('Nie znaleziono płatności')
  if (payment.status === 'refunded') return { status: 'succeeded' as RefundStatus }
  if (payment.status !== 'completed' || !payment.stripe_payment_intent_id) throw new Error('Płatność nie może zostać zwrócona')
  const pass = Array.isArray(payment.training_passes) ? payment.training_passes[0] : payment.training_passes
  if (pass && Number(pass.entries_remaining) !== Number(pass.entries_total)) {
    throw new Error('Nie można automatycznie zwrócić wykorzystanego karnetu')
  }

  const { data: existing } = await db.from('training_commerce_refunds').select('id, status, stripe_refund_id, attempt_count').eq('payment_id', payment.id).maybeSingle()
  if (existing?.status === 'succeeded') return { refundId: existing.id, status: 'succeeded' as RefundStatus }
  if (existing?.stripe_refund_id && existing.status === 'pending') {
    const stripeRefund = await stripe.refunds.retrieve(existing.stripe_refund_id, { stripeAccount: payment.stripe_account_id })
    return { refundId: existing.id, status: await applyTrainingCommerceRefundStatus(existing.id, stripeRefund) }
  }

  const refundResult = existing
    ? await db.from('training_commerce_refunds').update({ status: 'pending', reason: reason?.slice(0, 1000) || null, error_message: null, notification_sent_at: null, stripe_refund_id: null, attempt_count: Number(existing.attempt_count) + 1 }).eq('id', existing.id).select('id, attempt_count').single()
    : await db.from('training_commerce_refunds').insert({
      payment_id: payment.id, requested_by: requestedBy, amount: payment.amount,
      currency: payment.currency, reason: reason?.slice(0, 1000) || null,
    }).select('id, attempt_count').single()
  if (refundResult.error || !refundResult.data) throw refundResult.error ?? new Error('Nie udało się zapisać zwrotu')
  const refundId = refundResult.data.id
  try {
    const stripeRefund = await stripe.refunds.create({
      payment_intent: payment.stripe_payment_intent_id,
      amount: Math.round(Number(payment.amount) * 100),
      reason: 'requested_by_customer',
      metadata: {
        payment_kind: 'training_commerce_refund',
        training_commerce_refund_id: refundId,
        training_commerce_payment_id: payment.id,
      },
    }, {
      stripeAccount: payment.stripe_account_id,
      idempotencyKey: `training-commerce-refund-${refundId}-${refundResult.data.attempt_count}`,
    })
    await db.from('training_commerce_refunds').update({ stripe_refund_id: stripeRefund.id }).eq('id', refundId)
    return { refundId, status: await applyTrainingCommerceRefundStatus(refundId, stripeRefund) }
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : 'Nieznany błąd Stripe'
    await db.from('training_commerce_refunds').update({ status: 'failed', error_message: message }).eq('id', refundId)
    throw new Error(`Nie udało się zlecić zwrotu: ${message}`)
  }
}
