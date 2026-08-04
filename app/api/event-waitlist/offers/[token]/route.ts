import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabaseServer'
import { buildEventPriceItems } from '@/lib/eventPricing'
import { createEventCheckout, prepareEventRegistrationItems } from '@/lib/eventCheckout'
import { sendRegistrationEmail } from '@/lib/email'
import { tryProcessEventWaitlist } from '@/lib/eventWaitlist'

interface Params {
  params: Promise<{ token: string }>
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function loadOffer(token: string) {
  const supabase = createServerClient()
  const { data: entry } = await supabase
    .from('event_waitlist_entries')
    .select('id, event_id, participant_id, form_data, status, offer_expires_at, converted_registration_id')
    .eq('offer_token', token)
    .maybeSingle()
  if (!entry) return null

  const [{ data: event }, { data: participant }] = await Promise.all([
    supabase.from('events').select('*').eq('id', entry.event_id).maybeSingle(),
    supabase.from('participants').select('*').eq('id', entry.participant_id).maybeSingle(),
  ])
  if (!event || !participant) return null
  return { entry, event, participant }
}

export async function GET(_req: Request, { params }: Params) {
  const { token } = await params
  if (!UUID_RE.test(token)) return NextResponse.json({ error: 'Nieprawidłowy link' }, { status: 400 })
  const offer = await loadOffer(token)
  if (!offer) return NextResponse.json({ error: 'Nie znaleziono propozycji miejsca' }, { status: 404 })

  return NextResponse.json({
    status: offer.entry.status,
    expiresAt: offer.entry.offer_expires_at,
    event: {
      title: offer.event.title,
      slug: offer.event.slug,
      startAt: offer.event.start_at,
      location: offer.event.location,
    },
    dogName: offer.participant.dog_name,
  })
}

export async function POST(req: Request, { params }: Params) {
  const { token } = await params
  if (!UUID_RE.test(token)) return NextResponse.json({ error: 'Nieprawidłowy link' }, { status: 400 })

  let body: { action?: string } = {}
  try {
    body = await req.json()
  } catch {
    // Accept is the default action for simple clients.
  }
  const action = body.action ?? 'accept'
  if (action !== 'accept' && action !== 'decline') {
    return NextResponse.json({ error: 'Nieprawidłowa akcja' }, { status: 400 })
  }

  const offer = await loadOffer(token)
  if (!offer) return NextResponse.json({ error: 'Nie znaleziono propozycji miejsca' }, { status: 404 })
  if (offer.entry.status !== 'offered') {
    return NextResponse.json({ error: 'Ta propozycja nie jest już aktywna' }, { status: 409 })
  }
  if (!offer.entry.offer_expires_at || new Date(offer.entry.offer_expires_at) <= new Date()) {
    await createServerClient()
      .from('event_waitlist_entries')
      .update({ status: 'expired' })
      .eq('id', offer.entry.id)
      .eq('status', 'offered')
    await tryProcessEventWaitlist(offer.entry.event_id)
    return NextResponse.json({ error: 'Czas na potwierdzenie miejsca już minął' }, { status: 410 })
  }

  const supabase = createServerClient()
  if (action === 'decline') {
    const { data: declined } = await supabase
      .from('event_waitlist_entries')
      .update({ status: 'cancelled' })
      .eq('id', offer.entry.id)
      .eq('status', 'offered')
      .select('id')
      .maybeSingle()
    if (!declined) return NextResponse.json({ error: 'Ta propozycja nie jest już aktywna' }, { status: 409 })
    await tryProcessEventWaitlist(offer.entry.event_id)
    return NextResponse.json({ status: 'declined' })
  }

  let priceItems
  try {
    priceItems = buildEventPriceItems(offer.event, offer.entry.form_data ?? {})
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Nieprawidłowa cena zapisu' }, { status: 400 })
  }
  const isPaid = priceItems.length > 0

  if (isPaid) {
    const { data: payoutProfile } = await supabase
      .from('profiles')
      .select('stripe_account_id, stripe_onboarded')
      .eq('id', offer.event.created_by)
      .maybeSingle()
    if (!payoutProfile?.stripe_onboarded || !payoutProfile.stripe_account_id) {
      return NextResponse.json({ error: 'Płatności dla tego wydarzenia nie są jeszcze dostępne' }, { status: 409 })
    }
  }

  const { data: registrationId, error: acceptError } = await supabase.rpc(
    'accept_event_waitlist_offer',
    { p_offer_token: token },
  )
  if (acceptError || typeof registrationId !== 'string') {
    const message = acceptError?.message ?? 'Nie udało się potwierdzić miejsca'
    const status = message.includes('expired') ? 410 : 409
    return NextResponse.json({ error: status === 410 ? 'Czas na potwierdzenie miejsca już minął' : 'Miejsce nie jest już dostępne' }, { status })
  }

  const { data: registration } = await supabase
    .from('registrations')
    .select('id, participant_id, status, form_data')
    .eq('id', registrationId)
    .single()
  if (!registration) return NextResponse.json({ error: 'Nie udało się odczytać utworzonego zapisu' }, { status: 500 })

  let checkoutUrl: string | null = null
  try {
    if (isPaid) {
      const checkoutInput = {
        registration,
        event: offer.event,
        participant: {
          owner_email: offer.participant.owner_email,
          owner_name: offer.participant.owner_name,
          dog_name: offer.participant.dog_name,
          user_id: offer.participant.user_id,
        },
        pendingApproval: !offer.event.auto_confirm,
      }
      if (offer.event.auto_confirm) {
        const checkout = await createEventCheckout(checkoutInput, req.url)
        checkoutUrl = checkout.checkoutUrl
      } else {
        await prepareEventRegistrationItems(checkoutInput)
      }
    }
  } catch (error) {
    console.error('[event-waitlist] Failed to prepare converted registration:', error)
    await supabase.from('registrations').delete().eq('id', registrationId)
    await supabase
      .from('event_waitlist_entries')
      .update({ status: 'offered', converted_registration_id: null, converted_at: null })
      .eq('id', offer.entry.id)
      .eq('converted_registration_id', registrationId)
    return NextResponse.json({ error: 'Nie udało się przygotować płatności. Spróbuj ponownie.' }, { status: 502 })
  }

  if (!isPaid || !offer.event.auto_confirm) {
    try {
      await sendRegistrationEmail({
        to: offer.participant.owner_email,
        ownerName: offer.participant.owner_name ?? '',
        dogName: offer.participant.dog_name ?? '',
        eventTitle: offer.event.title,
        eventDate: offer.event.start_at,
        eventLocation: offer.event.location,
        status: registration.status === 'confirmed' ? 'confirmed' : 'pending',
        formFields: Array.isArray(offer.event.form_fields) ? offer.event.form_fields : [],
        formData: registration.form_data ?? {},
      })
    } catch (emailError) {
      console.error('[event-waitlist] Failed to send confirmation email:', emailError)
    }
  }

  return NextResponse.json({ status: registration.status, registrationId, checkoutUrl })
}
