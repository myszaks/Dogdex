import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { sendTrainingBookingConfirmation, sendTrainingBookingToTrainer } from '@/lib/email'
import { formatEmailDateTime } from '@/lib/emailDate'
import { getServerUser } from '@/lib/getServerUser'
import { createAuthClient, createServerClient, hasServiceRoleKey } from '@/lib/supabaseServer'
import {
  bookingFitsAvailability,
  bookingsOverlap,
  getBookingDateTimeParts,
  getInitialTrainingBookingState,
  resolveBookingDuration,
} from '@/lib/trainingBooking'
import { hydrateTrainingBookings } from '@/lib/trainingBookingRelations'

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null

export async function GET() {
  const { user } = await getServerUser()
  if (!user) {
    return NextResponse.json({ error: 'Brak uprawnień' }, { status: 401 })
  }

  const supabase = await createAuthClient()
  const relationClient = createServerClient()
  const { data, error } = await supabase
    .from('training_bookings')
    .select('*')
    .eq('user_id', user.id)
    .order('scheduled_at', { ascending: false })

  if (error) {
    console.error('[training-bookings][GET] Failed to load bookings:', error)
    return NextResponse.json({ error: 'Nie udało się pobrać rezerwacji' }, { status: 500 })
  }

  try {
    const bookings = await hydrateTrainingBookings(relationClient, data ?? [], {
      dogsClient: supabase,
      paymentsClient: supabase,
    })
    return NextResponse.json(bookings)
  } catch (relationsError) {
    console.error('[training-bookings][GET] Failed to hydrate relations:', relationsError)
    return NextResponse.json({ error: 'Nie udało się pobrać rezerwacji' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const { user } = await getServerUser()
  if (!user) {
    return NextResponse.json({ error: 'Brak uprawnień' }, { status: 401 })
  }
  if (!hasServiceRoleKey()) {
    return NextResponse.json({ error: 'Brak konfiguracji serwera rezerwacji' }, { status: 503 })
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Nieprawidłowy JSON' }, { status: 400 })
  }

  const { training_type_id, dog_id, scheduled_at, duration_min, notes_user } = body
  if (
    typeof training_type_id !== 'string'
    || !training_type_id
    || typeof scheduled_at !== 'string'
    || !scheduled_at
  ) {
    return NextResponse.json({ error: 'Typ treningu i czas są wymagane' }, { status: 400 })
  }
  if (dog_id != null && typeof dog_id !== 'string') {
    return NextResponse.json({ error: 'Nieprawidłowy identyfikator psa' }, { status: 400 })
  }
  if (notes_user != null && (typeof notes_user !== 'string' || notes_user.length > 2000)) {
    return NextResponse.json({ error: 'Notatka może mieć maksymalnie 2000 znaków' }, { status: 400 })
  }

  const supabase = await createAuthClient()
  const serviceClient = createServerClient()

  const { data: trainingType } = await serviceClient
    .from('training_types')
    .select('*')
    .eq('id', training_type_id)
    .eq('is_active', true)
    .single()

  if (!trainingType) {
    return NextResponse.json({ error: 'Nie znaleziono typu treningu' }, { status: 404 })
  }

  const [{ data: trainerProfile }, { data: trainerPaymentProfile }] = await Promise.all([
    serviceClient
    .from('trainer_profiles')
    .select('*')
    .eq('trainer_id', trainingType.trainer_id)
      .eq('is_active', true)
      .single(),
    serviceClient
      .from('profiles')
      .select('stripe_account_id, stripe_onboarded')
      .eq('id', trainingType.trainer_id)
      .maybeSingle(),
  ])

  if (!trainerProfile) {
    return NextResponse.json({ error: 'Trener nie przyjmuje obecnie rezerwacji' }, { status: 409 })
  }

  const actualDuration = resolveBookingDuration(duration_min, trainingType.duration_min)
  const stripeAccountId = trainerPaymentProfile?.stripe_onboarded
    ? trainerPaymentProfile.stripe_account_id
    : null
  const priceAmount = Number(trainingType.price_per_hour) * actualDuration / 60
  if (!Number.isFinite(priceAmount) || priceAmount < 0) {
    return NextResponse.json({ error: 'Nieprawidłowa cena treningu' }, { status: 500 })
  }
  if (priceAmount > 0 && !stripeAccountId) {
    return NextResponse.json(
      { error: 'Trener nie skonfigurował jeszcze płatności dla tej oferty' },
      { status: 409 },
    )
  }
  if (priceAmount > 0 && !stripe) {
    return NextResponse.json({ error: 'Płatności nie są skonfigurowane' }, { status: 503 })
  }

  const scheduledDate = new Date(scheduled_at as string)
  if (Number.isNaN(scheduledDate.getTime()) || actualDuration <= 0) {
    return NextResponse.json({ error: 'Nieprawidłowy termin lub czas trwania' }, { status: 400 })
  }
  if (scheduledDate.getTime() <= Date.now()) {
    return NextResponse.json({ error: 'Termin treningu musi być w przyszłości' }, { status: 409 })
  }

  if (dog_id) {
    const { data: dog } = await supabase
      .from('dogs')
      .select('id')
      .eq('id', dog_id)
      .eq('user_id', user.id)
      .maybeSingle()

    if (!dog) {
      return NextResponse.json({ error: 'Nieprawidłowy pies dla tej rezerwacji' }, { status: 403 })
    }
  }

  // Vercel Hobby can schedule this cleanup only once per day. Reconcile here
  // as well so an expired payment hold never blocks a new booking until the
  // next scheduled run.
  const { error: reconciliationError } = await serviceClient
    .rpc('reconcile_training_booking_states')
  if (reconciliationError) {
    console.error('[training-bookings] Opportunistic reconciliation failed:', reconciliationError)
  }

  const endTime = new Date(scheduledDate.getTime() + actualDuration * 60000)

  const { data: trainerTrainingTypes, error: trainerTrainingTypesError } = await serviceClient
    .from('training_types')
    .select('id')
    .eq('trainer_id', trainingType.trainer_id)

  if (trainerTrainingTypesError) {
    return NextResponse.json({ error: 'Nie udało się sprawdzić dostępności trenera' }, { status: 500 })
  }

  const trainerTrainingTypeIds = (trainerTrainingTypes || []).map(type => type.id)
  const { data: existingBookings, error: conflictsError } = await serviceClient
    .from('training_bookings')
    .select('id, scheduled_at, duration_min')
    .in('training_type_id', trainerTrainingTypeIds)
    .in('status', ['pending', 'confirmed'])
    .gt('scheduled_at', new Date(scheduledDate.getTime() - 8 * 60 * 60 * 1000).toISOString())
    .lt('scheduled_at', endTime.toISOString())

  if (conflictsError) {
    return NextResponse.json({ error: 'Nie udało się sprawdzić konfliktów rezerwacji' }, { status: 500 })
  }

  const hasConflict = (existingBookings || []).some(existing =>
    bookingsOverlap(
      new Date(existing.scheduled_at),
      existing.duration_min,
      scheduledDate,
      actualDuration
    )
  )

  if (hasConflict) {
    return NextResponse.json(
      { error: 'Ten termin jest już zarezerwowany. Wybierz inny czas.' },
      { status: 409 }
    )
  }

  const { date: bookingDate } = getBookingDateTimeParts(scheduledDate)
  const { data: availabilitySlots, error: availabilityError } = await serviceClient
    .from('trainer_date_availability')
    .select('*')
    .eq('trainer_id', trainingType.trainer_id)
    .eq('available_date', bookingDate)
    .eq('is_active', true)

  if (availabilityError) {
    return NextResponse.json(
      { error: 'Nie udało się sprawdzić dostępności trenera' },
      { status: 500 }
    )
  }

  if (!availabilitySlots || availabilitySlots.length === 0) {
    return NextResponse.json(
      { error: 'Trener nie ma dostępności na wybrany dzień' },
      { status: 409 }
    )
  }

  const matchingAvailability = availabilitySlots.find(slot =>
    bookingFitsAvailability(scheduledDate, actualDuration, slot.start_time, slot.end_time)
  )
  if (!matchingAvailability) {
    return NextResponse.json(
      { error: 'Wybrany trening nie mieści się w żadnym przedziale dostępności trenera' },
      { status: 409 }
    )
  }

  const isPaidBooking = priceAmount > 0
  const initialBookingState = getInitialTrainingBookingState(priceAmount)
  const { data: booking, error } = await serviceClient
    .from('training_bookings')
    .insert([{
      training_type_id,
      user_id: user.id,
      dog_id: (dog_id as string | null) || null,
      scheduled_at: scheduledDate.toISOString(),
      duration_min: actualDuration,
      ...initialBookingState,
      notes_user: (notes_user as string | null) || null,
    }])
    .select()
    .single()

  if (error) {
    if (error.message?.includes('training_booking_conflict')) {
      return NextResponse.json(
        { error: 'Ten termin został właśnie zarezerwowany. Wybierz inny czas.' },
        { status: 409 }
      )
    }
    return NextResponse.json({ error: 'Nie udało się utworzyć rezerwacji' }, { status: 500 })
  }

  const userEmail = user.email || ''
  const userName = user.user_metadata?.full_name || 'Użytkownik'
  const formattedDate = formatEmailDateTime(scheduledDate.toISOString())

  let checkoutUrl: string | null = null
  if (stripe && stripeAccountId && Number.isFinite(priceAmount) && priceAmount > 0) {
    const { data: payment, error: paymentInsertError } = await serviceClient
      .from('training_payments')
      .insert([{
        booking_id: booking.id,
        amount: priceAmount,
        currency: 'PLN',
        stripe_account_id: stripeAccountId,
        status: 'pending',
      }])
      .select('id')
      .single()

    if (paymentInsertError || !payment) {
      await serviceClient
        .from('training_bookings')
        .update({
          status: 'cancelled',
          expires_at: null,
          cancellation_reason: 'Nie udało się rozpocząć płatności',
          cancellation_requested_by: 'user',
          cancellation_approved_at: new Date().toISOString(),
        })
        .eq('id', booking.id)
      return NextResponse.json({ error: 'Nie udało się rozpocząć płatności' }, { status: 502 })
    }

    try {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL
        ?? process.env.NEXT_PUBLIC_SITE_URL
        ?? new URL(req.url).origin
      const baseMyTrainingsUrl = new URL('/moje-zapisy?tab=trainings', appUrl).toString()

      const session = await stripe.checkout.sessions.create(
        {
          payment_method_types: ['card'],
          mode: 'payment',
          customer_email: userEmail,
          expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
          line_items: [{
            price_data: {
              currency: 'pln',
              product_data: {
                name: trainingType.name,
                description: `Trening z ${trainerProfile.full_name}`,
              },
              unit_amount: Math.round(priceAmount * 100),
            },
            quantity: 1,
          }],
          success_url: `${baseMyTrainingsUrl}&payment=success&booking_id=${booking.id}`,
          cancel_url: `${baseMyTrainingsUrl}&payment=cancelled&booking_id=${booking.id}`,
          payment_intent_data: {
            metadata: {
              booking_id: booking.id,
              trainer_id: trainingType.trainer_id,
              user_id: user.id,
            },
          },
          metadata: {
            booking_id: booking.id,
            trainer_id: trainingType.trainer_id,
            user_id: user.id,
          },
        },
        {
          stripeAccount: stripeAccountId,
          idempotencyKey: `training-checkout-${booking.id}`,
        }
      )
      if (!session.url) throw new Error('Stripe nie zwrócił adresu płatności')
      checkoutUrl = session.url

      const { error: paymentError } = await serviceClient
        .from('training_payments')
        .update({ stripe_session_id: session.id })
        .eq('id', payment.id)
      if (paymentError) {
        // The payment row already exists and the webhook can recover it through
        // booking_id metadata even if persisting the session id failed.
        console.error('[Stripe] Failed to persist checkout session id:', {
          bookingId: booking.id,
          sessionId: session.id,
        })
      }
    } catch (err) {
      console.error('[Stripe] Error creating checkout session:', err)
      await Promise.all([
        serviceClient
          .from('training_payments')
          .update({ status: 'failed' })
          .eq('id', payment.id),
        serviceClient
          .from('training_bookings')
          .update({
            status: 'cancelled',
            expires_at: null,
            cancellation_reason: 'Nie udało się rozpocząć płatności',
            cancellation_requested_by: 'user',
            cancellation_approved_at: new Date().toISOString(),
          })
          .eq('id', booking.id),
      ])
      return NextResponse.json({ error: 'Nie udało się rozpocząć płatności' }, { status: 502 })
    }
  }

  // Paid bookings are announced only after Stripe confirms payment in the webhook.
  if (priceAmount === 0) {
    await sendTrainingBookingConfirmation({
      to: userEmail,
      userName,
      trainerName: trainerProfile.full_name,
      trainingType: trainingType.name,
      trainingDate: formattedDate,
      duration: actualDuration,
    })

    const { data: { user: trainerUser } } = await serviceClient.auth.admin
      .getUserById(trainingType.trainer_id)

    if (trainerUser?.email) {
      await sendTrainingBookingToTrainer({
        to: trainerUser.email,
        trainerName: trainerProfile.full_name,
        userName,
        trainingType: trainingType.name,
        trainingDate: formattedDate,
        duration: actualDuration,
        userNotes: (notes_user as string | null) || undefined,
        bookingId: booking.id,
      })
    }
  }

  return NextResponse.json({
    ...booking,
    checkoutUrl,
    payment: isPaidBooking
      ? { amount: priceAmount, currency: 'PLN', status: 'pending' }
      : null,
  }, { status: 201 })
}
