import Stripe from 'stripe'
import { createServerClient } from '@/lib/supabaseServer'
import { applyTrainingCommerceRefundStatus } from '@/lib/trainingCommerceRefund'

const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null

export async function reconcileTrainingCommerce(businessProfileId?: string) {
  if (!stripe) throw new Error('Stripe nie jest skonfigurowany')
  const db = createServerClient()
  let query = db.from('training_commerce_payments')
    .select('id, status, amount, refunded_amount, stripe_session_id, stripe_payment_intent_id, stripe_account_id, stripe_charge_id, receipt_url')
    .in('status', ['pending', 'completed', 'partially_refunded', 'refunded'])
    .order('created_at', { ascending: false }).limit(200)
  if (businessProfileId) query = query.eq('business_profile_id', businessProfileId)
  const { data: payments, error } = await query
  if (error) throw error
  let checked = 0
  let corrected = 0
  const errors: Array<{ paymentId: string; message: string }> = []
  for (const payment of payments ?? []) {
    checked += 1
    try {
      if (payment.status === 'pending' && payment.stripe_session_id) {
        const session = await stripe.checkout.sessions.retrieve(payment.stripe_session_id, { stripeAccount: payment.stripe_account_id })
        if (session.status === 'expired') {
          await db.rpc('fail_training_commerce_checkout', { target_payment_id: payment.id, target_session_id: payment.stripe_session_id })
          corrected += 1
        }
        continue
      }
      if (!payment.stripe_payment_intent_id) continue
      const intent = await stripe.paymentIntents.retrieve(payment.stripe_payment_intent_id, { expand: ['latest_charge'] }, { stripeAccount: payment.stripe_account_id })
      const charge = intent.latest_charge && typeof intent.latest_charge !== 'string' ? intent.latest_charge : null
      const refunded = (charge?.amount_refunded ?? 0) / 100
      const expectedStatus = refunded >= Number(payment.amount) ? 'refunded' : refunded > 0 ? 'partially_refunded' : 'completed'
      if (payment.status !== expectedStatus || Number(payment.refunded_amount) !== refunded || payment.stripe_charge_id !== (charge?.id ?? null) || payment.receipt_url !== (charge?.receipt_url ?? null)) {
        await db.from('training_commerce_payments').update({
          status: expectedStatus,
          refunded_amount: refunded,
          stripe_charge_id: charge?.id ?? null,
          receipt_url: charge?.receipt_url ?? null,
          last_reconciled_at: new Date().toISOString(),
        }).eq('id', payment.id)
        corrected += 1
      }
    } catch (caught) {
      errors.push({ paymentId: payment.id, message: caught instanceof Error ? caught.message : 'Nieznany błąd' })
    }
  }
  let refundsChecked = 0
  let refundQuery = db.from('training_commerce_refunds')
    .select('id, stripe_refund_id, training_commerce_payments!inner(business_profile_id, stripe_account_id)')
    .in('status', ['pending', 'requires_action']).not('stripe_refund_id', 'is', null).limit(100)
  if (businessProfileId) refundQuery = refundQuery.eq('training_commerce_payments.business_profile_id', businessProfileId)
  const { data: refunds } = await refundQuery
  for (const refund of refunds ?? []) {
    const payment = Array.isArray(refund.training_commerce_payments) ? refund.training_commerce_payments[0] : refund.training_commerce_payments
    if (!refund.stripe_refund_id || !payment?.stripe_account_id) continue
    try {
      const stripeRefund = await stripe.refunds.retrieve(refund.stripe_refund_id, { stripeAccount: payment.stripe_account_id })
      await applyTrainingCommerceRefundStatus(refund.id, stripeRefund)
      refundsChecked += 1
    } catch (caught) {
      errors.push({ paymentId: refund.id, message: caught instanceof Error ? caught.message : 'Błąd uzgadniania zwrotu' })
    }
  }
  return { checked, corrected, refundsChecked, errors }
}
