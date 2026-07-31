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
      const { data: payment, error: paymentLookupError } = await supabase
        .from('training_payments')
        .select('id, booking_id, amount, currency, stripe_session_id, stripe_account_id, status')
        .eq('booking_id', bookingId)
        .maybeSingle()

      if (paymentLookupError || !payment) {
        console.error('[Webhook] Payment record not found:', paymentLookupError)
        return NextResponse.json({ error: 'Payment not found' }, { status: 500 })
      }

      const amountMatches = session.amount_total === Math.round(Number(payment.amount) * 100)
      const currencyMatches = session.currency?.toUpperCase() === payment.currency.toUpperCase()
      const sessionMatches = !payment.stripe_session_id || payment.stripe_session_id === session.id
      const accountMatches = !event.account || event.account === payment.stripe_account_id
      const paymentIntentId = typeof session.payment_intent === 'string'
        ? session.payment_intent
        : session.payment_intent?.id

      if (
        session.payment_status !== 'paid'
        || !paymentIntentId
        || !amountMatches
        || !currencyMatches
        || !sessionMatches
        || !accountMatches
      ) {
        console.error('[Webhook] Checkout session does not match the stored payment', {
          bookingId,
          sessionId: session.id,
        })
        return NextResponse.json({ error: 'Payment verification failed' }, { status: 400 })
      }

      const { data: transitionRows, error: transitionError } = await supabase
        .rpc('complete_training_checkout', {
          target_booking_id: bookingId,
          target_session_id: session.id,
          target_payment_intent_id: paymentIntentId,
        })

      if (transitionError) {
        console.error('[Webhook] Atomic checkout transition failed:', transitionError)
        return NextResponse.json({ error: 'Booking update failed' }, { status: 500 })
      }

      const transition = Array.isArray(transitionRows) ? transitionRows[0] : transitionRows
      let notificationClaim: { booking_id: string; amount: number } | null = null
      let claimError = null
      if (transition?.notification_required) {
        const claimResult = await supabase
          .from('training_payments')
          .update({ confirmation_sent_at: new Date().toISOString() })
          .eq('id', payment.id)
          .is('confirmation_sent_at', null)
          .select('booking_id, amount')
          .maybeSingle()
        notificationClaim = claimResult.data
        claimError = claimResult.error
      }

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
      const { data: failed, error: transitionError } = await supabase
        .rpc('fail_training_checkout', {
          target_booking_id: bookingId,
          target_session_id: session.id,
          failure_reason: event.type === 'checkout.session.expired'
            ? 'Sesja płatności wygasła'
            : 'Płatność nie powiodła się',
        })

      if (transitionError) {
        console.error('[Webhook] Error releasing failed booking:', transitionError)
        return NextResponse.json({ error: 'Booking update failed' }, { status: 500 })
      }

      console.log(`[Webhook] Payment failed or expired for booking ${bookingId}; changed=${Boolean(failed)}`)
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
