import Stripe from 'stripe'
import { createServerClient } from '@/lib/supabaseServer'

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null

export type TrainingCommerceKind = 'course' | 'pass'

export class TrainingCommerceError extends Error {
  constructor(message: string, public status = 500) {
    super(message)
  }
}

type CheckoutItem = {
  kind: TrainingCommerceKind
  entityId: string
  userId: string
  trainerId: string
  customerEmail?: string | null
  name: string
  description: string
  amount: number
  currency: string
}

export async function createTrainingCommerceCheckout(request: Request, item: CheckoutItem) {
  if (!stripe) throw new TrainingCommerceError('Płatności nie są skonfigurowane', 503)
  if (!Number.isFinite(item.amount) || item.amount <= 0) {
    throw new TrainingCommerceError('Nieprawidłowa kwota płatności', 400)
  }

  const db = createServerClient()
  const { data: payoutProfile, error: payoutError } = await db
    .from('profiles')
    .select('stripe_account_id, stripe_onboarded')
    .eq('id', item.trainerId)
    .maybeSingle()
  if (payoutError || !payoutProfile?.stripe_onboarded || !payoutProfile.stripe_account_id) {
    throw new TrainingCommerceError('Trener nie skonfigurował płatności Stripe dla tej oferty', 409)
  }

  const targetColumn = item.kind === 'course' ? 'enrollment_id' : 'pass_id'
  const { data: ownership } = item.kind === 'course'
    ? await db.from('training_course_enrollments').select('training_courses!inner(business_profile_id)').eq('id', item.entityId).maybeSingle()
    : await db.from('training_passes').select('training_pass_products!inner(business_profile_id)').eq('id', item.entityId).maybeSingle()
  const ownershipRelation = item.kind === 'course'
    ? (ownership as { training_courses?: { business_profile_id?: string } | Array<{ business_profile_id?: string }> } | null)?.training_courses
    : (ownership as { training_pass_products?: { business_profile_id?: string } | Array<{ business_profile_id?: string }> } | null)?.training_pass_products
  const businessProfileId = (Array.isArray(ownershipRelation) ? ownershipRelation[0] : ownershipRelation)?.business_profile_id
  if (!businessProfileId) throw new TrainingCommerceError('Oferta nie jest przypisana do profilu biznesowego', 409)
  const { data: existing } = await db
    .from('training_commerce_payments')
    .select('id, status, checkout_url, expires_at, attempt_count')
    .eq(targetColumn, item.entityId)
    .maybeSingle()

  if (
    existing?.status === 'pending'
    && existing.checkout_url
    && existing.expires_at
    && new Date(existing.expires_at).getTime() > Date.now()
  ) {
    return { checkoutUrl: existing.checkout_url, paymentId: existing.id }
  }
  if (existing?.status === 'completed') {
    throw new TrainingCommerceError('Ta płatność została już zrealizowana', 409)
  }

  const paymentExpiry = new Date(Date.now() + 35 * 60 * 1000).toISOString()
  const paymentPayload = {
    enrollment_id: item.kind === 'course' ? item.entityId : null,
    pass_id: item.kind === 'pass' ? item.entityId : null,
    user_id: item.userId,
    trainer_id: item.trainerId,
    business_profile_id: businessProfileId,
    amount: item.amount,
    currency: item.currency.toUpperCase(),
    stripe_account_id: payoutProfile.stripe_account_id,
    status: 'pending',
    stripe_session_id: null,
    stripe_payment_intent_id: null,
    checkout_url: null,
    expires_at: paymentExpiry,
    attempt_count: existing ? Number(existing.attempt_count) + 1 : 1,
    completed_at: null,
  }
  const paymentResult = existing
    ? await db.from('training_commerce_payments').update(paymentPayload).eq('id', existing.id).select('id, attempt_count').single()
    : await db.from('training_commerce_payments').insert(paymentPayload).select('id, attempt_count').single()
  if (paymentResult.error || !paymentResult.data) {
    throw new TrainingCommerceError('Nie udało się rozpocząć płatności', 502)
  }

  const payment = paymentResult.data
  const entityUpdate = item.kind === 'course'
    ? db.from('training_course_enrollments').update({ payment_status: 'pending', expires_at: paymentExpiry }).eq('id', item.entityId).eq('user_id', item.userId)
    : db.from('training_passes').update({ payment_status: 'pending', payment_expires_at: paymentExpiry }).eq('id', item.entityId).eq('user_id', item.userId)
  const { error: entityError } = await entityUpdate
  if (entityError) {
    await db.from('training_commerce_payments').update({ status: 'failed', expires_at: null }).eq('id', payment.id)
    throw new TrainingCommerceError('Nie udało się zarezerwować płatności', 500)
  }

  try {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL
      ?? process.env.NEXT_PUBLIC_SITE_URL
      ?? new URL(request.url).origin
    const returnUrl = new URL('/moje-zapisy?tab=trainings', appUrl).toString()
    const metadata = {
      payment_kind: item.kind === 'course' ? 'training_course' : 'training_pass',
      training_commerce_payment_id: payment.id,
      user_id: item.userId,
      trainer_id: item.trainerId,
      business_profile_id: businessProfileId,
    }
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      customer_email: item.customerEmail || undefined,
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
      line_items: [{
        price_data: {
          currency: item.currency.toLowerCase(),
          product_data: { name: item.name, description: item.description },
          unit_amount: Math.round(item.amount * 100),
        },
        quantity: 1,
      }],
      success_url: `${returnUrl}&payment=success&kind=${item.kind}&item_id=${item.entityId}`,
      cancel_url: `${returnUrl}&payment=cancelled&kind=${item.kind}&item_id=${item.entityId}`,
      payment_intent_data: { metadata },
      metadata,
    }, {
      stripeAccount: payoutProfile.stripe_account_id,
      idempotencyKey: `training-${item.kind}-checkout-${payment.id}-${payment.attempt_count}`,
    })
    if (!session.url) throw new Error('Stripe nie zwrócił adresu płatności')
    const { error: saveError } = await db.from('training_commerce_payments').update({
      stripe_session_id: session.id,
      checkout_url: session.url,
    }).eq('id', payment.id).eq('status', 'pending')
    if (saveError) throw saveError
    return { checkoutUrl: session.url, paymentId: payment.id }
  } catch (error) {
    console.error('[training-commerce] Checkout creation failed:', error)
    await db.rpc('fail_training_commerce_checkout', {
      target_payment_id: payment.id,
      target_session_id: '',
    })
    throw new TrainingCommerceError('Nie udało się utworzyć sesji płatności Stripe', 502)
  }
}

export async function cancelTrainingCommerceCheckout(paymentId: string) {
  if (!stripe) throw new TrainingCommerceError('Płatności nie są skonfigurowane', 503)
  const db = createServerClient()
  const { data: payment } = await db.from('training_commerce_payments')
    .select('id, status, stripe_session_id, stripe_account_id')
    .eq('id', paymentId).maybeSingle()
  if (!payment || payment.status !== 'pending') return false
  if (payment.stripe_session_id) {
    const session = await stripe.checkout.sessions.retrieve(payment.stripe_session_id, { stripeAccount: payment.stripe_account_id })
    if (session.status === 'complete') throw new TrainingCommerceError('Płatność jest już przetwarzana. Odśwież widok za chwilę.', 409)
    if (session.status === 'open') await stripe.checkout.sessions.expire(payment.stripe_session_id, { stripeAccount: payment.stripe_account_id })
  }
  const { data, error } = await db.rpc('fail_training_commerce_checkout', {
    target_payment_id: payment.id,
    target_session_id: payment.stripe_session_id ?? '',
  })
  if (error) throw error
  return Boolean(data)
}
