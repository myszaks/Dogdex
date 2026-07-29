import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createAuthClient, createServerClient, hasServiceRoleKey } from '@/lib/supabaseServer'
import { getServerUser } from '@/lib/getServerUser'
import { sendTrainingBookingConfirmation, sendTrainingCancellationEmail } from '@/lib/email'
import { formatEmailDateTime } from '@/lib/emailDate'
import { isTrainerRole } from '@/lib/roles'
import {
  validateBookingTransition,
  type BookingStatus,
  type PaymentStatus,
} from '@/lib/trainingBookingState'

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null

interface Params {
  params: Promise<{ id: string }>
}

// Get booking details
export async function GET(req: Request, { params }: Params) {
  const { user } = await getServerUser()
  if (!user) return NextResponse.json({ error: 'Brak uprawnień' }, { status: 401 })

  const { id } = await params
  const supabase = await createAuthClient()

  const { data, error } = await supabase
    .from('training_bookings')
    .select('*, training_types(trainer_id, name, price_per_hour)')
    .eq('id', id)
    .maybeSingle()

  if (error) return NextResponse.json({ error: 'Nie udało się pobrać rezerwacji' }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Nie znaleziono rezerwacji' }, { status: 404 })

  return NextResponse.json(data)
}

// Update booking (accept, reject, or cancel)
export async function PATCH(req: Request, { params }: Params) {
  const { id } = await params
  const { user, role } = await getServerUser()
  if (!user) return NextResponse.json({ error: 'Brak uprawnień' }, { status: 401 })
  if (!hasServiceRoleKey()) {
    return NextResponse.json({ error: 'Brak konfiguracji serwera rezerwacji' }, { status: 503 })
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Nieprawidłowe JSON' }, { status: 400 })
  }

  const { status, cancellation_reason, notes_trainer } = body

  if (!status || !['confirmed', 'cancelled', 'completed'].includes(status as string)) {
    return NextResponse.json({ error: 'Nieprawidłowy status' }, { status: 400 })
  }
  if (
    cancellation_reason != null
    && (typeof cancellation_reason !== 'string' || cancellation_reason.length > 1000)
  ) {
    return NextResponse.json({ error: 'Powód może mieć maksymalnie 1000 znaków' }, { status: 400 })
  }
  if (notes_trainer != null && (typeof notes_trainer !== 'string' || notes_trainer.length > 2000)) {
    return NextResponse.json({ error: 'Notatka może mieć maksymalnie 2000 znaków' }, { status: 400 })
  }

  const supabase = createServerClient()

  // Get booking and verify permissions
  const { data: booking } = await supabase
    .from('training_bookings')
    .select('*, training_types(trainer_id, name)')
    .eq('id', id)
    .single()

  if (!booking) {
    return NextResponse.json({ error: 'Nie znaleziono rezerwacji' }, { status: 404 })
  }

  // User must be either the booking owner or the trainer
  const isOwner = booking.user_id === user.id
  const isTrainer = booking.training_types?.trainer_id === user.id && isTrainerRole(role)

  if (!isOwner && !isTrainer) {
    return NextResponse.json({ error: 'Brak uprawnień' }, { status: 403 })
  }

  const { data: payment, error: paymentError } = await supabase
    .from('training_payments')
    .select('id, status, stripe_session_id, stripe_payment_intent_id, stripe_account_id')
    .eq('booking_id', id)
    .maybeSingle()

  if (paymentError) {
    return NextResponse.json({ error: 'Nie udało się sprawdzić płatności' }, { status: 500 })
  }

  const transition = validateBookingTransition({
    currentStatus: booking.status as BookingStatus,
    nextStatus: status as BookingStatus,
    actor: isTrainer ? 'trainer' : 'owner',
    paymentStatus: (payment?.status as PaymentStatus | undefined) ?? null,
    scheduledAt: booking.scheduled_at,
    durationMin: booking.duration_min,
  })

  if (!transition.allowed) {
    return NextResponse.json({ error: transition.message }, { status: 409 })
  }
  if (transition.noop) {
    return NextResponse.json(booking)
  }

  if (status === 'cancelled' && payment?.status === 'pending') {
    if (!stripe || !payment.stripe_session_id || !payment.stripe_account_id) {
      return NextResponse.json(
        { error: 'Nie można bezpiecznie anulować oczekującej płatności' },
        { status: 409 },
      )
    }

    try {
      const checkoutSession = await stripe.checkout.sessions.retrieve(
        payment.stripe_session_id,
        { stripeAccount: payment.stripe_account_id },
      )

      if (checkoutSession.status === 'complete') {
        return NextResponse.json(
          { error: 'Płatność jest już przetwarzana. Odśwież stronę za chwilę.' },
          { status: 409 },
        )
      }
      if (checkoutSession.status === 'open') {
        await stripe.checkout.sessions.expire(
          payment.stripe_session_id,
          { stripeAccount: payment.stripe_account_id },
        )
      }
    } catch (expireError) {
      console.error('[Stripe] Failed to expire cancelled checkout:', expireError)
      return NextResponse.json(
        { error: 'Nie udało się anulować oczekującej płatności' },
        { status: 502 },
      )
    }

    const { error: failedPaymentError } = await supabase
      .from('training_payments')
      .update({ status: 'failed' })
      .eq('id', payment.id)

    if (failedPaymentError) {
      return NextResponse.json(
        { error: 'Płatność anulowano, ale zapis statusu nie powiódł się' },
        { status: 500 },
      )
    }
  }

  if (status === 'cancelled' && isTrainer) {
    if (payment?.status === 'completed') {
      if (
        !stripe
        || !payment.stripe_payment_intent_id
        || !payment.stripe_account_id
      ) {
        return NextResponse.json(
          { error: 'Nie można automatycznie zwrócić tej płatności' },
          { status: 409 }
        )
      }

      try {
        await stripe.refunds.create(
          { payment_intent: payment.stripe_payment_intent_id },
          {
            stripeAccount: payment.stripe_account_id,
            idempotencyKey: `booking-refund-${id}`,
          }
        )
      } catch (refundError) {
        console.error('[Stripe] Booking refund failed:', refundError)
        return NextResponse.json({ error: 'Nie udało się zwrócić płatności' }, { status: 502 })
      }

      const { error: paymentUpdateError } = await supabase
        .from('training_payments')
        .update({ status: 'refunded' })
        .eq('id', payment.id)

      if (paymentUpdateError) {
        return NextResponse.json({ error: 'Zwrot wykonano, ale zapis statusu nie powiódł się' }, { status: 500 })
      }
    }
  }

  // Prepare update
  const update: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
  }

  if (status === 'cancelled') {
    update.cancellation_reason = (cancellation_reason as string | null) || null
    update.cancellation_requested_by = isTrainer ? 'trainer' : 'user'
    update.cancellation_approved_at = new Date().toISOString()
  }

  if (notes_trainer && isTrainer) {
    update.notes_trainer = notes_trainer
  }

  const { data, error } = await supabase
    .from('training_bookings')
    .update(update)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: 'Nie udało się zaktualizować rezerwacji' }, { status: 500 })

  // Send emails based on status change
  if (status === 'confirmed' && isTrainer) {
    // Send confirmation email to user
    const userEmail = (await supabase.auth.admin.getUserById(booking.user_id)).data.user?.email || ''
    const trainerProfile = (await supabase.from('trainer_profiles').select('*').eq('trainer_id', user.id).single()).data

    if (userEmail && trainerProfile) {
      const formattedDate = formatEmailDateTime(booking.scheduled_at)

      await sendTrainingBookingConfirmation({
        to: userEmail,
        userName: (await supabase.auth.admin.getUserById(booking.user_id)).data.user?.user_metadata?.full_name || 'Użytkownik',
        trainerName: trainerProfile.full_name,
        trainingType: booking.training_types?.name || 'Trening',
        trainingDate: formattedDate,
        duration: booking.duration_min,
      })
    }
  }

  if (status === 'cancelled') {
    // Send cancellation emails to both user and trainer
    const formattedDate = formatEmailDateTime(booking.scheduled_at)

    // Email to user (if cancelled by trainer)
    if (isTrainer) {
      const userEmail = (await supabase.auth.admin.getUserById(booking.user_id)).data.user?.email || ''
      const trainerProfile = (await supabase.from('trainer_profiles').select('*').eq('trainer_id', user.id).single()).data

      if (userEmail && trainerProfile) {
        await sendTrainingCancellationEmail({
          to: userEmail,
          recipientName: (await supabase.auth.admin.getUserById(booking.user_id)).data.user?.user_metadata?.full_name || 'Użytkownik',
          trainingType: booking.training_types?.name || 'Trening',
          trainingDate: formattedDate,
          cancelledBy: 'trainer',
          reason: (cancellation_reason as string | null) || undefined,
        })
      }
    }

    // Email to trainer (if cancelled by user)
    if (isOwner) {
      const trainerProfile = (await supabase.from('trainer_profiles').select('*').eq('trainer_id', booking.training_types?.trainer_id).single()).data
      const trainerUser = (await supabase.auth.admin.getUserById(booking.training_types?.trainer_id)).data.user

      if (trainerProfile && trainerUser?.email) {
        await sendTrainingCancellationEmail({
          to: trainerUser.email,
          recipientName: trainerProfile.full_name,
          trainingType: booking.training_types?.name || 'Trening',
          trainingDate: formattedDate,
          cancelledBy: 'user',
          reason: (cancellation_reason as string | null) || undefined,
        })
      }
    }
  }

  return NextResponse.json(data)
}
