import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { getServerUser } from '@/lib/getServerUser'
import { createServerClient, hasServiceRoleKey } from '@/lib/supabaseServer'

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null

interface Params {
  params: Promise<{ id: string }>
}

export async function POST(_req: Request, { params }: Params) {
  const { user } = await getServerUser()
  if (!user) {
    return NextResponse.json({ error: 'Brak uprawnień' }, { status: 401 })
  }
  if (!hasServiceRoleKey() || !stripe) {
    return NextResponse.json({ error: 'Płatności nie są skonfigurowane' }, { status: 503 })
  }

  const { id } = await params
  const supabase = createServerClient()
  const { data: booking, error: bookingError } = await supabase
    .from('training_bookings')
    .select('id, user_id, status')
    .eq('id', id)
    .maybeSingle()

  if (bookingError) {
    return NextResponse.json({ error: 'Nie udało się sprawdzić rezerwacji' }, { status: 500 })
  }
  if (!booking) {
    return NextResponse.json({ error: 'Nie znaleziono rezerwacji' }, { status: 404 })
  }
  if (booking.user_id !== user.id) {
    return NextResponse.json({ error: 'Brak uprawnień' }, { status: 403 })
  }
  if (booking.status !== 'pending') {
    return NextResponse.json(
      { error: 'Ta rezerwacja nie oczekuje już na płatność. Odśwież listę rezerwacji.' },
      { status: 409 },
    )
  }

  const { data: payment, error: paymentError } = await supabase
    .from('training_payments')
    .select('status, stripe_session_id, stripe_account_id')
    .eq('booking_id', id)
    .maybeSingle()

  if (paymentError) {
    return NextResponse.json({ error: 'Nie udało się sprawdzić płatności' }, { status: 500 })
  }
  if (
    !payment
    || payment.status !== 'pending'
    || !payment.stripe_session_id
    || !payment.stripe_account_id
  ) {
    return NextResponse.json(
      { error: 'Ta płatność nie może już zostać wznowiona. Odśwież listę rezerwacji.' },
      { status: 409 },
    )
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(
      payment.stripe_session_id,
      { stripeAccount: payment.stripe_account_id },
    )

    if (session.status === 'complete') {
      return NextResponse.json(
        { error: 'Płatność została już przyjęta i oczekuje na potwierdzenie. Odśwież stronę za chwilę.' },
        { status: 409 },
      )
    }

    if (session.status !== 'open' || !session.url) {
      const { data: checkoutFailed, error: failedPaymentError } = await supabase
        .rpc('fail_training_checkout', {
          target_booking_id: id,
          target_session_id: payment.stripe_session_id,
          failure_reason: 'Sesja płatności wygasła',
        })
      if (failedPaymentError || !checkoutFailed) {
        console.error('[training-checkout] Failed to release expired session:', failedPaymentError)
        return NextResponse.json(
          { error: 'Sesja płatności wygasła, ale nie udało się zwolnić terminu. Spróbuj ponownie za chwilę.' },
          { status: 500 },
        )
      }
      return NextResponse.json(
        { error: 'Sesja płatności wygasła, a termin został zwolniony. Wybierz termin ponownie.' },
        { status: 410 },
      )
    }

    return NextResponse.json({ checkoutUrl: session.url })
  } catch (checkoutError) {
    console.error('[training-checkout] Failed to resume Checkout:', checkoutError)
    return NextResponse.json(
      { error: 'Nie udało się wznowić płatności. Spróbuj ponownie za chwilę.' },
      { status: 502 },
    )
  }
}
