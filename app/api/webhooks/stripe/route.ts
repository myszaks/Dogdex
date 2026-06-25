import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createAuthClient } from '@/lib/supabaseServer'

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null

/**
 * Stripe Webhook Handler
 * Handles: checkout.session.completed, checkout.session.async_payment_failed
 * 
 * Requires: STRIPE_WEBHOOK_SECRET in .env.local
 */
export async function POST(req: Request) {
  if (!stripe) {
    return NextResponse.json(
      { error: 'Stripe not configured' },
      { status: 500 }
    )
  }

  const body = await req.text()
  const signature = req.headers.get('stripe-signature')

  if (!signature || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json(
      { error: 'Missing signature or webhook secret' },
      { status: 400 }
    )
  }

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    )
  } catch (err) {
    console.error('[Webhook] Signature verification failed:', err)
    return NextResponse.json(
      { error: 'Webhook signature verification failed' },
      { status: 400 }
    )
  }

  const supabase = await createAuthClient()

  try {
    // Handle successful payment
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session

      if (!session.metadata?.booking_id) {
        console.warn('[Webhook] No booking_id in metadata')
        return NextResponse.json({ received: true })
      }

      const bookingId = session.metadata.booking_id

      // Update booking status to confirmed
      const { error: bookingError } = await supabase
        .from('training_bookings')
        .update({ status: 'confirmed' })
        .eq('id', bookingId)

      if (bookingError) {
        console.error('[Webhook] Error updating booking:', bookingError)
        return NextResponse.json({ received: true }, { status: 200 })
      }

      // Update payment status
      const { error: paymentError } = await supabase
        .from('training_payments')
        .update({
          status: 'completed',
          stripe_payment_intent_id: session.payment_intent as string,
        })
        .eq('stripe_session_id', session.id)

      if (paymentError) {
        console.error('[Webhook] Error updating payment:', paymentError)
      }

      console.log(`[Webhook] Booking ${bookingId} confirmed and payment completed`)
    }

    // Handle failed payment
    if (event.type === 'checkout.session.async_payment_failed') {
      const session = event.data.object as Stripe.Checkout.Session

      if (!session.metadata?.booking_id) {
        return NextResponse.json({ received: true })
      }

      const bookingId = session.metadata.booking_id

      // Update payment status to failed
      const { error: paymentError } = await supabase
        .from('training_payments')
        .update({ status: 'failed' })
        .eq('stripe_session_id', session.id)

      if (paymentError) {
        console.error('[Webhook] Error updating payment to failed:', paymentError)
      }

      console.log(`[Webhook] Payment failed for booking ${bookingId}`)
    }

    // Handle charge refunded
    if (event.type === 'charge.refunded') {
      const charge = event.data.object as Stripe.Charge

      if (charge.metadata?.booking_id) {
        const bookingId = charge.metadata.booking_id

        // Update payment status to refunded
        const { error: paymentError } = await supabase
          .from('training_payments')
          .update({ status: 'refunded' })
          .eq('booking_id', bookingId)

        if (paymentError) {
          console.error('[Webhook] Error marking payment as refunded:', paymentError)
        }

        console.log(`[Webhook] Booking ${bookingId} marked as refunded`)
      }
    }

    return NextResponse.json({ received: true }, { status: 200 })
  } catch (err) {
    console.error('[Webhook] Unexpected error:', err)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
