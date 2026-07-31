import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createServerClient } from '@/lib/supabaseServer'

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null

interface Params {
  params: Promise<{ id: string }>
}

export async function GET(request: NextRequest, { params }: Params) {
  const { id } = await params
  const token = request.nextUrl.searchParams.get('token')
  const db = createServerClient()
  const { data: payment } = await db
    .from('event_payments')
    .select('id, registration_id, status, checkout_token, stripe_session_id, stripe_account_id')
    .eq('id', id)
    .maybeSingle()
  if (!payment || !token || payment.checkout_token !== token) {
    return NextResponse.json({ error: 'Nieprawidłowy link anulowania' }, { status: 403 })
  }

  const { data: registration } = await db
    .from('registrations')
    .select('event_id')
    .eq('id', payment.registration_id)
    .maybeSingle()
  const { data: event } = registration
    ? await db.from('events').select('slug').eq('id', registration.event_id).maybeSingle()
    : { data: null }
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
    ?? process.env.NEXT_PUBLIC_SITE_URL
    ?? request.nextUrl.origin
  const returnUrl = new URL(event?.slug ? `/events/${event.slug}` : '/', appUrl)

  if (payment.status === 'pending') {
    if (!stripe || !payment.stripe_session_id) {
      returnUrl.searchParams.set('payment', 'cancel_error')
      return NextResponse.redirect(returnUrl)
    }
    try {
      const session = await stripe.checkout.sessions.retrieve(
        payment.stripe_session_id,
        { stripeAccount: payment.stripe_account_id },
      )
      if (session.status === 'complete') {
        returnUrl.searchParams.set('payment', 'processing')
        return NextResponse.redirect(returnUrl)
      }
      if (session.status === 'open') {
        await stripe.checkout.sessions.expire(
          payment.stripe_session_id,
          { stripeAccount: payment.stripe_account_id },
        )
      }
      await db.rpc('fail_event_checkout', {
        target_payment_id: payment.id,
        target_session_id: payment.stripe_session_id,
      })
    } catch (error) {
      console.error('[event-payment] Failed to cancel Checkout:', error)
      returnUrl.searchParams.set('payment', 'cancel_error')
      return NextResponse.redirect(returnUrl)
    }
  }

  returnUrl.searchParams.set('payment', 'cancelled')
  return NextResponse.redirect(returnUrl)
}
