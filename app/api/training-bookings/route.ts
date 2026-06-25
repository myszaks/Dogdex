import { NextResponse } from 'next/server'
import { createAuthClient } from '@/lib/supabaseServer'
import { getServerUser } from '@/lib/getServerUser'
import { sendTrainingBookingConfirmation, sendTrainingBookingToTrainer } from '@/lib/email'
import Stripe from 'stripe'

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null

const BOOKING_TIME_ZONE = 'Europe/Warsaw'

function getDateTimeParts(date: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BOOKING_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date)

  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find(part => part.type === type)?.value || ''

  return {
    date: `${value('year')}-${value('month')}-${value('day')}`,
    time: `${value('hour')}:${value('minute')}`,
  }
}

function toMinutes(time: string) {
  const [hours, minutes] = time.split(':').map(Number)
  return hours * 60 + minutes
}

export async function GET() {
  const { user } = await getServerUser()
  if (!user) return NextResponse.json({ error: 'Nie autoryzowany' }, { status: 401 })

  const supabase = await createAuthClient()

  // User can see their own bookings
  const { data, error } = await supabase
    .from('training_bookings')
    .select(`
      *,
      training_types(id, trainer_id, name, price_per_hour),
      dogs(id, name)
    `)
    .eq('user_id', user.id)
    .order('scheduled_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: Request) {
  const { user } = await getServerUser()
  if (!user) return NextResponse.json({ error: 'Nie autoryzowany' }, { status: 401 })

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Nieprawidłowe JSON' }, { status: 400 })
  }

  const { training_type_id, dog_id, scheduled_at, duration_min, notes_user } = body

  if (!training_type_id || !scheduled_at) {
    return NextResponse.json({ error: 'Typ treningu i czas są wymagane' }, { status: 400 })
  }

  const supabase = await createAuthClient()

  // Get training type details
  const { data: trainingType } = await supabase
    .from('training_types')
    .select('*')
    .eq('id', training_type_id)
    .single()

  if (!trainingType) {
    return NextResponse.json({ error: 'Nie znaleziono typu treningu' }, { status: 404 })
  }

  // Get trainer profile
  const { data: trainerProfile } = await supabase
    .from('trainer_profiles')
    .select('*')
    .eq('trainer_id', trainingType.trainer_id)
    .single()

  const actualDuration = typeof duration_min === 'number' ? duration_min : trainingType.duration_min
  const scheduledDate = new Date(scheduled_at as string)
  if (Number.isNaN(scheduledDate.getTime()) || actualDuration <= 0) {
    return NextResponse.json({ error: 'Nieprawidłowy termin lub czas trwania' }, { status: 400 })
  }

  const endTime = new Date(scheduledDate.getTime() + actualDuration * 60000)

  // Check trainer-level conflicts across all training types.
  const { data: trainerTrainingTypes, error: trainerTrainingTypesError } = await supabase
    .from('training_types')
    .select('id')
    .eq('trainer_id', trainingType.trainer_id)

  if (trainerTrainingTypesError) {
    return NextResponse.json({ error: trainerTrainingTypesError.message }, { status: 500 })
  }

  const trainerTrainingTypeIds = (trainerTrainingTypes || []).map(type => type.id)
  const { data: existingBookings, error: conflictsError } = await supabase
    .from('training_bookings')
    .select('id, scheduled_at, duration_min')
    .in('training_type_id', trainerTrainingTypeIds)
    .in('status', ['pending', 'confirmed'])
    .lt('scheduled_at', endTime.toISOString())

  if (conflictsError) {
    return NextResponse.json({ error: conflictsError.message }, { status: 500 })
  }

  const hasConflict = (existingBookings || []).some(existing => {
    const existingStart = new Date(existing.scheduled_at)
    const existingEnd = new Date(existingStart.getTime() + existing.duration_min * 60000)
    return existingStart < endTime && existingEnd > scheduledDate
  })

  if (hasConflict) {
    return NextResponse.json(
      { error: 'Ten termin jest już zarezerwowany. Wybierz inny czas.' },
      { status: 409 }
    )
  }

  // Check for conflicts (double booking)
  const { data: conflicts } = await supabase
    .from('training_bookings')
    .select('id')
    .eq('training_type_id', training_type_id)
    .in('status', ['pending', 'confirmed'])
    .gt('scheduled_at', scheduledDate.toISOString())
    .lt('scheduled_at', endTime.toISOString())

  if (conflicts && conflicts.length > 0) {
    return NextResponse.json(
      { error: 'Ten termin jest już zarezerwowany. Wybierz inny czas.' },
      { status: 409 }
    )
  }

  // Check trainer availability (date-based system)
  const { date: bookingDate, time: bookingStartTime } = getDateTimeParts(scheduledDate)
  const { date: bookingEndDate, time: bookingEndTime } = getDateTimeParts(endTime)

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

  // Verify booking time falls within availability slot.
  const bookingStartMinutes = toMinutes(bookingStartTime)
  const bookingEndMinutes = toMinutes(bookingEndTime)
  const availabilityStartMinutes = toMinutes(availabilitySlot.start_time)
  const availabilityEndMinutes = toMinutes(availabilitySlot.end_time)

  if (
    bookingEndDate !== bookingDate ||
    bookingStartMinutes < availabilityStartMinutes ||
    bookingEndMinutes > availabilityEndMinutes
  ) {
    return NextResponse.json(
      { error: `Trener dostępny jest od ${availabilitySlot.start_time} do ${availabilitySlot.end_time}` },
      { status: 409 }
    )
  }

  // Create booking
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

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Get user email for confirmation (from JWT user object)
  const userEmail = user.email || ''
  const userName = user.user_metadata?.full_name || 'Użytkownik'

  // Format date for email
  const formatter = new Intl.DateTimeFormat('pl-PL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
  const formattedDate = formatter.format(scheduledDate)

  // Send confirmation email to user
  await sendTrainingBookingConfirmation({
    to: userEmail,
    userName,
    trainerName: trainerProfile?.full_name || 'Trener',
    trainingType: trainingType.name,
    trainingDate: formattedDate,
    duration: actualDuration,
    price: trainingType.price_per_hour,
  })

  // Send notification to trainer
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

  // If trainer has Stripe account, create checkout session
  let checkoutUrl: string | null = null
  if (stripe && trainerProfile?.stripe_account_id && trainingType.price_per_hour) {
    try {
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
          success_url: `${process.env.NEXT_PUBLIC_APP_URL}/moje-treningi?payment=success&booking_id=${booking.id}`,
          cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/moje-treningi?payment=cancelled&booking_id=${booking.id}`,
          payment_intent_data: {
            application_fee_amount: 0, // 0% fee for now; can be adjusted later
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

      // Save Stripe session ID to training_payments
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
      // Continue without checkout – booking is created, payment is optional
    }
  }

  return NextResponse.json({ ...booking, checkoutUrl }, { status: 201 })
}
