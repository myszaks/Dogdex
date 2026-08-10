import Stripe from 'stripe'
import { createServerClient } from '@/lib/supabaseServer'
import { buildEventPriceItems, type EventPricingSource } from '@/lib/eventPricing'

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null

interface EventCheckoutInput {
  registration: {
    id: string
    participant_id: string
    form_data: Record<string, unknown>
  }
  event: EventPricingSource & {
    id: string
    slug: string
    created_by: string
    business_profile_id?: string | null
    auto_confirm: boolean
  }
  participant: {
    owner_email: string
    owner_name?: string | null
    dog_name?: string | null
    user_id?: string | null
  }
  pendingApproval?: boolean
}

export async function prepareEventRegistrationItems(input: EventCheckoutInput) {
  const db = createServerClient()
  const items = buildEventPriceItems(input.event, input.registration.form_data)
  if (items.length === 0) return []
  const { data, error } = await db
    .from('event_registration_items')
    .upsert(items.map(item => ({
      registration_id: input.registration.id,
      item_key: item.itemKey,
      kind: item.kind,
      form_field_id: item.formFieldId,
      occurrence_date: item.occurrenceDate,
      label: item.label,
      amount: item.amount,
      currency: item.currency,
      status: input.pendingApproval ? 'pending_approval' : 'pending_payment',
    })), { onConflict: 'registration_id,item_key' })
    .select()
  if (error) throw error
  return data ?? []
}

export async function createEventCheckout(
  input: EventCheckoutInput,
  requestUrl: string,
): Promise<{ paymentId: string; checkoutUrl: string; checkoutToken: string }> {
  if (!stripe) throw new Error('Płatności nie są skonfigurowane')
  const db = createServerClient()
  const items = await prepareEventRegistrationItems({ ...input, pendingApproval: false })
  if (items.length === 0) throw new Error('To wydarzenie nie wymaga płatności')
  let businessProfileId = input.event.business_profile_id ?? null
  if (!businessProfileId) {
    const { data: eventProfile } = await db.from('events').select('business_profile_id').eq('id', input.event.id).maybeSingle()
    businessProfileId = eventProfile?.business_profile_id ?? null
  }

  const { data: payoutProfile, error: payoutError } = await db
    .from('profiles')
    .select('stripe_account_id, stripe_onboarded')
    .eq('id', input.event.created_by)
    .single()
  if (payoutError || !payoutProfile?.stripe_onboarded || !payoutProfile.stripe_account_id) {
    throw new Error('Organizator nie skonfigurował płatności Stripe')
  }

  const amountInCents = items.reduce(
    (sum, item) => sum + Math.round(Number(item.amount) * 100),
    0,
  )
  const amount = amountInCents / 100
  const currency = String(items[0].currency || 'PLN').toUpperCase()
  // Stripe requires expires_at to be at least 30 minutes in the future.
  // The extra minute absorbs request latency and second rounding.
  const expiresInSeconds = input.pendingApproval ? 23 * 60 * 60 : 31 * 60
  const expiresAt = new Date(Date.now() + expiresInSeconds * 1000)
  const { data: payment, error: paymentError } = await db
    .from('event_payments')
    .insert({
      registration_id: input.registration.id,
      business_profile_id: businessProfileId,
      payee_user_id: input.event.created_by,
      payer_user_id: input.participant.user_id || null,
      payer_email: input.participant.owner_email,
      amount,
      currency,
      stripe_account_id: payoutProfile.stripe_account_id,
      expires_at: expiresAt.toISOString(),
    })
    .select('id, checkout_token')
    .single()
  if (paymentError || !payment) throw paymentError ?? new Error('Nie udało się utworzyć płatności')

  const { error: allocationError } = await db
    .from('event_payment_items')
    .insert(items.map(item => ({
      payment_id: payment.id,
      registration_item_id: item.id,
      amount: item.amount,
    })))
  if (allocationError) {
    await Promise.all([
      db.from('event_payments').update({ status: 'failed', expires_at: null }).eq('id', payment.id),
      db.from('event_registration_items').update({ status: 'cancelled' }).eq('registration_id', input.registration.id),
      db.from('registrations').update({ status: 'cancelled', payment_expires_at: null }).eq('id', input.registration.id),
    ])
    throw allocationError
  }

  try {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL
      ?? process.env.NEXT_PUBLIC_SITE_URL
      ?? new URL(requestUrl).origin
    const successUrl = new URL(`/events/${input.event.slug}`, appUrl)
    successUrl.searchParams.set('payment', 'success')
    successUrl.searchParams.set('registration_id', input.registration.id)
    const cancelUrl = new URL(`/api/event-payments/${payment.id}/cancel`, appUrl)
    cancelUrl.searchParams.set('token', payment.checkout_token)

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      customer_email: input.participant.owner_email,
      expires_at: Math.floor(expiresAt.getTime() / 1000),
      line_items: items.map(item => ({
        price_data: {
          currency: currency.toLowerCase(),
          product_data: { name: item.label },
          unit_amount: Math.round(Number(item.amount) * 100),
        },
        quantity: 1,
      })),
      success_url: successUrl.toString(),
      cancel_url: cancelUrl.toString(),
      payment_intent_data: {
        metadata: {
          payment_kind: 'event_registration',
          event_payment_id: payment.id,
          registration_id: input.registration.id,
          event_id: input.event.id,
        },
      },
      metadata: {
        payment_kind: 'event_registration',
        event_payment_id: payment.id,
        registration_id: input.registration.id,
        event_id: input.event.id,
      },
    }, {
      stripeAccount: payoutProfile.stripe_account_id,
      idempotencyKey: `event-checkout-${payment.id}`,
    })
    if (!session.url) throw new Error('Stripe nie zwrócił adresu płatności')

    const { error: persistError } = await db
      .from('event_payments')
      .update({ stripe_session_id: session.id, checkout_url: session.url })
      .eq('id', payment.id)
    if (persistError) throw persistError
    await db
      .from('registrations')
      .update({
        payment_expires_at: expiresAt.toISOString(),
        approved_at: input.pendingApproval ? new Date().toISOString() : null,
      })
      .eq('id', input.registration.id)

    return { paymentId: payment.id, checkoutUrl: session.url, checkoutToken: payment.checkout_token }
  } catch (error) {
    await Promise.all([
      db.from('event_payments').update({ status: 'failed', expires_at: null }).eq('id', payment.id),
      db.from('event_registration_items').update({ status: 'cancelled' }).eq('registration_id', input.registration.id),
      db.from('registrations').update({ status: 'cancelled', payment_expires_at: null }).eq('id', input.registration.id),
    ])
    throw error
  }
}

export async function cancelPendingEventCheckouts(registrationIds: string[]): Promise<void> {
  if (registrationIds.length === 0) return
  if (!stripe) throw new Error('Płatności nie są skonfigurowane')

  const db = createServerClient()
  const { data: payments, error: lookupError } = await db
    .from('event_payments')
    .select('id, stripe_session_id, stripe_account_id')
    .in('registration_id', registrationIds)
    .eq('status', 'pending')
  if (lookupError) throw lookupError

  for (const payment of payments ?? []) {
    if (!payment.stripe_session_id) {
      throw new Error('Oczekująca płatność nie ma zapisanej sesji Stripe')
    }
    const session = await stripe.checkout.sessions.retrieve(
      payment.stripe_session_id,
      { stripeAccount: payment.stripe_account_id },
    )
    if (session.status === 'complete') {
      throw new Error('Płatność została zakończona i oczekuje na potwierdzenie webhooka')
    }
    if (session.status === 'open') {
      await stripe.checkout.sessions.expire(
        payment.stripe_session_id,
        { stripeAccount: payment.stripe_account_id },
      )
    }
    const { error: transitionError } = await db.rpc('fail_event_checkout', {
      target_payment_id: payment.id,
      target_session_id: payment.stripe_session_id,
    })
    if (transitionError) throw transitionError
  }
}
