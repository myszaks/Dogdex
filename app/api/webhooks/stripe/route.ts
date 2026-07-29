import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createServerClient, hasServiceRoleKey } from '@/lib/supabaseServer'
import {
  sendTrainingBookingConfirmation,
  sendTrainingBookingToTrainer,
} from '@/lib/email'
import { formatEmailDateTime } from '@/lib/emailDate'

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null

/**
 * Stripe Webhook Handler
 * Handles: checkout.session.completed, checkout.session.async_payment_failed,
 * checkout.session.expired, charge.refunded
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
  if (!hasServiceRoleKey()) {
    return NextResponse.json(
      { error: 'Supabase service role not configured' },
      { status: 500 }
    )
  }

  const body = await req.text()
  const signature = req.headers.get('stripe-signature')

  if (!signature || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json(
      { error: 'Brakuje podpisu lub sekretu webhooka' },
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

  const supabase = createServerClient()

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
        return NextResponse.json({ error: 'Booking update failed' }, { status: 500 })
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
        return NextResponse.json({ error: 'Payment update failed' }, { status: 500 })
      }

      const { data: notificationClaim, error: claimError } = await supabase
        .from('training_payments')
        .update({ confirmation_sent_at: new Date().toISOString() })
        .eq('stripe_session_id', session.id)
        .is('confirmation_sent_at', null)
        .select('booking_id, amount')
        .maybeSingle()

      if (claimError) {
        console.error('[Webhook] Error claiming payment notification:', claimError)
        return NextResponse.json({ error: 'Notification claim failed' }, { status: 500 })
      }

      if (notificationClaim) {
        const { data: booking } = await supabase
          .from('training_bookings')
          .select('user_id, scheduled_at, duration_min, notes_user, training_types(trainer_id, name)')
          .eq('id', bookingId)
          .maybeSingle()

        const trainingType = Array.isArray(booking?.training_types)
          ? booking.training_types[0]
          : booking?.training_types
        const trainerId = trainingType?.trainer_id
        if (booking && trainerId) {
          const [
            { data: trainerProfile },
            { data: { user: customer } },
            { data: { user: trainer } },
          ] = await Promise.all([
            supabase
              .from('trainer_profiles')
              .select('full_name')
              .eq('trainer_id', trainerId)
              .maybeSingle(),
            supabase.auth.admin.getUserById(booking.user_id),
            supabase.auth.admin.getUserById(trainerId),
          ])

          if (trainerProfile && customer?.email) {
            const userName = customer.user_metadata?.full_name || 'Użytkownik'
            const trainingDate = formatEmailDateTime(booking.scheduled_at)

            await sendTrainingBookingConfirmation({
              to: customer.email,
              userName,
              trainerName: trainerProfile.full_name,
              trainingType: trainingType?.name || 'Trening',
              trainingDate,
              duration: booking.duration_min,
              price: Number(notificationClaim.amount),
            })

            if (trainer?.email) {
              await sendTrainingBookingToTrainer({
                to: trainer.email,
                trainerName: trainerProfile.full_name,
                userName,
                trainingType: trainingType?.name || 'Trening',
                trainingDate,
                duration: booking.duration_min,
                userNotes: booking.notes_user || undefined,
                bookingId,
              })
            }
          }
        }
      }

      console.log(`[Webhook] Booking ${bookingId} confirmed and payment completed`)
    }

    // Handle failed payment
    if (
      event.type === 'checkout.session.async_payment_failed'
      || event.type === 'checkout.session.expired'
    ) {
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
        return NextResponse.json({ error: 'Payment update failed' }, { status: 500 })
      }

      const { error: bookingError } = await supabase
        .from('training_bookings')
        .update({
          status: 'cancelled',
          cancellation_reason: event.type === 'checkout.session.expired'
            ? 'Sesja płatności wygasła'
            : 'Płatność nie powiodła się',
          cancellation_requested_by: 'user',
          cancellation_approved_at: new Date().toISOString(),
        })
        .eq('id', bookingId)
        .eq('status', 'pending')

      if (bookingError) {
        console.error('[Webhook] Error releasing failed booking:', bookingError)
        return NextResponse.json({ error: 'Booking update failed' }, { status: 500 })
      }

      console.log(`[Webhook] Payment failed or expired for booking ${bookingId}`)
    }

    // Handle charge refunded
    if (event.type === 'charge.refunded') {
      const charge = event.data.object as Stripe.Charge

      const paymentIntentId = typeof charge.payment_intent === 'string'
        ? charge.payment_intent
        : charge.payment_intent?.id

      if (paymentIntentId) {
        const { error: paymentError } = await supabase
          .from('training_payments')
          .update({ status: 'refunded' })
          .eq('stripe_payment_intent_id', paymentIntentId)

        if (paymentError) {
          console.error('[Webhook] Error marking payment as refunded:', paymentError)
          return NextResponse.json({ error: 'Payment update failed' }, { status: 500 })
        }

        console.log(`[Webhook] Payment intent ${paymentIntentId} marked as refunded`)
      }
    }

    return NextResponse.json({ received: true }, { status: 200 })
  } catch (err) {
    console.error('[Webhook] Unexpected error:', err)
    return NextResponse.json(
      { error: 'Wewnętrzny błąd serwera' },
      { status: 500 }
    )
  }
}
