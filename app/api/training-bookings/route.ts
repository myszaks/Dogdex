import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { sendTrainingBookingConfirmation, sendTrainingBookingToTrainer } from '@/lib/email'
import { formatEmailDateTime } from '@/lib/emailDate'
import { getServerUser } from '@/lib/getServerUser'
import { createAuthClient, createServerClient } from '@/lib/supabaseServer'
import {
  bookingFitsAvailability,
  bookingsOverlap,
  getBookingDateTimeParts,
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

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Nieprawidłowy JSON' }, { status: 400 })
  }

  const { training_type_id, dog_id, scheduled_at, duration_min, notes_user } = body
  if (!training_type_id || !scheduled_at) {
    return NextResponse.json({ error: 'Typ treningu i czas są wymagane' }, { status: 400 })
  }

  const supabase = await createAuthClient()

  const { data: trainingType } = await supabase
    .from('training_types')
    .select('*')
    .eq('id', training_type_id)
    .single()

  if (!trainingType) {
    return NextResponse.json({ error: 'Nie znaleziono typu treningu' }, { status: 404 })
  }

  const { data: trainerProfile } = await supabase
    .from('trainer_profiles')
    .select('*')
    .eq('trainer_id', trainingType.trainer_id)
    .single()

  const actualDuration = resolveBookingDuration(duration_min, trainingType.duration_min)
  const scheduledDate = new Date(scheduled_at as string)
  if (Number.isNaN(scheduledDate.getTime()) || actualDuration <= 0) {
    return NextResponse.json({ error: 'Nieprawidłowy termin lub czas trwania' }, { status: 400 })
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

  const endTime = new Date(scheduledDate.getTime() + actualDuration * 60000)

  const { data: trainerTrainingTypes, error: trainerTrainingTypesError } = await supabase
    .from('training_types')
    .select('id')
    .eq('trainer_id', trainingType.trainer_id)

  if (trainerTrainingTypesError) {
    return NextResponse.json({ error: 'Nie udało się sprawdzić dostępności trenera' }, { status: 500 })
  }

  const trainerTrainingTypeIds = (trainerTrainingTypes || []).map(type => type.id)
  const { data: existingBookings, error: conflictsError } = await supabase
    .from('training_bookings')
    .select('id, scheduled_at, duration_min')
    .in('training_type_id', trainerTrainingTypeIds)
    .in('status', ['pending', 'confirmed'])
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
  const { data: availabilitySlot } = await supabase
    .from('trainer_date_availability')
    .select('*')
    .eq('trainer_id', trainingType.trainer_id)
    .eq('available_date', bookingDate)
    .eq('is_active', true)
    .single()

  if (!availabilitySlot) {
    return NextResponse.json(
      { error: 'Trener nie ma dostępności na wybrany dzień' },
      { status: 409 }
    )
  }

  if (!bookingFitsAvailability(scheduledDate, actualDuration, availabilitySlot.start_time, availabilitySlot.end_time)) {
    return NextResponse.json(
      { error: `Trener dostępny jest od ${availabilitySlot.start_time} do ${availabilitySlot.end_time}` },
      { status: 409 }
    )
  }

  const { data: booking, error } = await supabase
    .from('training_bookings')
    .insert([{
      training_type_id,
      user_id: user.id,
      dog_id: (dog_id as string | null) || null,
      scheduled_at: scheduledDate.toISOString(),
      duration_min: actualDuration,
      status: 'pending',
      notes_user: (notes_user as string | null) || null,
    }])
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: 'Nie udało się utworzyć rezerwacji' }, { status: 500 })
  }

  const userEmail = user.email || ''
  const userName = user.user_metadata?.full_name || 'Użytkownik'
  const formattedDate = formatEmailDateTime(scheduledDate.toISOString())

  await sendTrainingBookingConfirmation({
    to: userEmail,
    userName,
    trainerName: trainerProfile?.full_name || 'Trener',
    trainingType: trainingType.name,
    trainingDate: formattedDate,
    duration: actualDuration,
    price: trainingType.price_per_hour,
  })

  const { data: { user: trainerUser } } = await supabase.auth.admin.getUserById(trainingType.trainer_id)

  if (trainerUser?.email) {
    await sendTrainingBookingToTrainer({
      to: trainerUser.email,
      trainerName: trainerProfile?.full_name || 'Trener',
      userName,
      trainingType: trainingType.name,
      trainingDate: formattedDate,
      duration: actualDuration,
      userNotes: (notes_user as string | null) || undefined,
      bookingId: booking.id,
    })
  }

  let checkoutUrl: string | null = null
  if (stripe && trainerProfile?.stripe_account_id && trainingType.price_per_hour) {
    try {
      const baseMyTrainingsUrl = `${process.env.NEXT_PUBLIC_APP_URL}/moje-zapisy?tab=trainings`

      const session = await stripe.checkout.sessions.create(
        {
          payment_method_types: ['card'],
          mode: 'payment',
          customer_email: userEmail,
          line_items: [{
            price_data: {
              currency: 'pln',
              product_data: {
                name: trainingType.name,
                description: `Trening z ${trainerProfile.full_name}`,
              },
              unit_amount: Math.round(trainingType.price_per_hour * 100),
            },
            quantity: 1,
          }],
          success_url: `${baseMyTrainingsUrl}&payment=success&booking_id=${booking.id}`,
          cancel_url: `${baseMyTrainingsUrl}&payment=cancelled&booking_id=${booking.id}`,
          payment_intent_data: {
            application_fee_amount: 0,
            on_behalf_of: trainerProfile.stripe_account_id,
          },
          metadata: {
            booking_id: booking.id,
            trainer_id: trainingType.trainer_id,
            user_id: user.id,
          },
        },
        {
          stripeAccount: trainerProfile.stripe_account_id,
        }
      )
      checkoutUrl = session.url

      await supabase.from('training_payments').insert([{
        booking_id: booking.id,
        amount: trainingType.price_per_hour,
        currency: 'PLN',
        stripe_session_id: session.id,
        stripe_account_id: trainerProfile.stripe_account_id,
        status: 'pending',
      }])
    } catch (err) {
      console.error('[Stripe] Error creating checkout session:', err)
    }
  }

  return NextResponse.json({ ...booking, checkoutUrl }, { status: 201 })
}
