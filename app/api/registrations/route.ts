import { NextResponse } from 'next/server'
import { createAuthClient, createServerClient } from '@/lib/supabaseServer'
import { checkRoleForApi, getServerUser } from '@/lib/getServerUser'
import { sendRegistrationEmail } from '@/lib/email'
import { isEventRegistrationOpen } from '@/lib/eventStatus'
import { enforcePublicRateLimits, getRequestIp } from '@/lib/publicRateLimit'
import { validateRegistrationFormData } from '@/lib/registrationFormValidation'
import { buildEventPriceItems } from '@/lib/eventPricing'
import { createEventCheckout, prepareEventRegistrationItems } from '@/lib/eventCheckout'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MAX_FORM_DATA_BYTES = 50_000

export async function GET(req: Request) {
  const auth = await checkRoleForApi(['organizer', 'admin'])
  if ('error' in auth) return auth.error

  const { searchParams } = new URL(req.url)
  const eventId = searchParams.get('eventId')
  if (!eventId) {
    return NextResponse.json({ error: 'Brak eventId' }, { status: 400 })
  }

  const supabase = createServerClient()
  const { data: event } = await supabase
    .from('events')
    .select('created_by')
    .eq('id', eventId)
    .maybeSingle()

  if (!event) return NextResponse.json({ error: 'Nie znaleziono wydarzenia' }, { status: 404 })
  if (auth.role !== 'admin' && event.created_by !== auth.user.id) {
    return NextResponse.json({ error: 'Brak uprawnień' }, { status: 403 })
  }

  const query = supabase
    .from('registrations')
    .select('*, participants(*)')
    .eq('event_id', eventId)
    .order('created_at', { ascending: true })

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: Request) {
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Nieprawidłowe JSON' }, { status: 400 })
  }

  const { eventId, ownerName, ownerEmail, dogName, dogBreed, dogId, extraFields } =
    body as {
      eventId: string
      ownerName: string
      ownerEmail?: string
      dogName: string
      dogBreed?: string
      dogId?: string | null
      extraFields?: Record<string, unknown>
    }

  if (!eventId || !dogName?.trim() || !ownerName?.trim() || !ownerEmail?.trim()) {
    return NextResponse.json(
      { error: 'Wymagane pola: eventId, ownerName, ownerEmail, dogName' },
      { status: 400 }
    )
  }

  const ownerEmailNorm = ownerEmail.trim().toLowerCase()
  const dogNameTrim = dogName.trim()
  if (!EMAIL_RE.test(ownerEmailNorm)) {
    return NextResponse.json({ error: 'Nieprawidłowy adres e-mail' }, { status: 400 })
  }
  if (
    ownerName.trim().length > 120
    || ownerEmailNorm.length > 254
    || dogNameTrim.length > 120
    || (dogBreed?.trim().length ?? 0) > 120
  ) {
    return NextResponse.json({ error: 'Przekroczono maksymalną długość pola' }, { status: 400 })
  }
  if (Buffer.byteLength(JSON.stringify(extraFields ?? {}), 'utf8') > MAX_FORM_DATA_BYTES) {
    return NextResponse.json({ error: 'Dane formularza są zbyt duże' }, { status: 413 })
  }

  const rateLimit = await enforcePublicRateLimits([
    {
      scope: 'registration-ip',
      identifier: getRequestIp(req),
      limit: 15,
      windowSeconds: 10 * 60,
    },
    {
      scope: 'registration-email-event',
      identifier: `${ownerEmailNorm}:${eventId}`,
      limit: 5,
      windowSeconds: 60 * 60,
    },
  ])

  if (!rateLimit.allowed) {
    if (rateLimit.reason === 'limited') {
      return NextResponse.json(
        { error: 'Zbyt wiele prób zapisu. Spróbuj ponownie później.' },
        {
          status: 429,
          headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) },
        },
      )
    }
    return NextResponse.json(
      { error: 'Zapisy są chwilowo niedostępne. Spróbuj ponownie później.' },
      { status: 503 },
    )
  }

  // Public endpoint — service role is used only after validation and rate limiting.
  const supabase = createServerClient()

  // Verify event exists and is open
  const { data: event } = await supabase
    .from('events')
    .select('id, slug, created_by, status, auto_confirm, max_participants, title, start_at, end_at, location, form_fields, registration_opens_at, registration_deadline, pricing_mode, entry_fee, date_prices, currency')
    .eq('id', eventId)
    .single()

  if (!event) return NextResponse.json({ error: 'Wydarzenie nie istnieje' }, { status: 404 })
  if (!isEventRegistrationOpen(event)) {
    return NextResponse.json({ error: 'Zapisy na to wydarzenie są zamknięte' }, { status: 409 })
  }

  const formValidation = validateRegistrationFormData(event.form_fields, extraFields)
  if (!formValidation.ok) {
    return NextResponse.json({ error: formValidation.error }, { status: 400 })
  }
  const normalizedExtraFields = formValidation.data
  let priceItems
  try {
    priceItems = buildEventPriceItems(event, normalizedExtraFields)
  } catch (pricingError) {
    return NextResponse.json({ error: (pricingError as Error).message }, { status: 400 })
  }
  const isPaidRegistration = priceItems.length > 0
  if (isPaidRegistration) {
    const { data: payoutProfile } = await supabase
      .from('profiles')
      .select('stripe_account_id, stripe_onboarded')
      .eq('id', event.created_by)
      .maybeSingle()
    if (!payoutProfile?.stripe_onboarded || !payoutProfile.stripe_account_id) {
      return NextResponse.json(
        { error: 'Organizator nie skonfigurował jeszcze płatności dla tego wydarzenia' },
        { status: 409 },
      )
    }
  }

  // Check max_participants limit
  if (event.max_participants) {
    const { count } = await supabase
      .from('registrations')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', eventId)
      .in('status', ['pending', 'confirmed'])
    if ((count ?? 0) >= event.max_participants) {
      return NextResponse.json({ error: 'Brak wolnych miejsc na to wydarzenie' }, { status: 409 })
    }
  }

  // Prevent duplicate registration: same owner_email + dog_name for the same event
  const dogIdNorm = typeof dogId === 'string' && dogId.trim() ? dogId.trim() : null
  const { user } = await getServerUser()

  if (dogIdNorm) {
    if (!user) {
      return NextResponse.json({ error: 'Brak uprawnień do użycia tego psa' }, { status: 401 })
    }

    const authSupabase = await createAuthClient()
    const { data: ownedDog, error: dogError } = await authSupabase
      .from('dogs')
      .select('id')
      .eq('id', dogIdNorm)
      .eq('user_id', user.id)
      .maybeSingle()

    if (dogError) {
      return NextResponse.json(
        { error: 'Nie udało się potwierdzić psa z profilu. Spróbuj ponownie.' },
        { status: 500 },
      )
    }
    if (!ownedDog) {
      return NextResponse.json({ error: 'Nieprawidłowy pies dla tego użytkownika' }, { status: 403 })
    }
  }

  const participantUserId = user && (
    dogIdNorm ||
    (ownerEmailNorm && user.email?.trim().toLowerCase() === ownerEmailNorm)
  )
    ? user.id
    : null

  const { data: matchingParticipants } = await supabase
    .from('participants')
    .select('id')
    .ilike('owner_email', ownerEmailNorm)
    .ilike('dog_name', dogNameTrim)

  if (matchingParticipants && matchingParticipants.length > 0) {
    const participantIds = matchingParticipants.map(p => p.id)
    const { data: existingRegs } = await supabase
      .from('registrations')
      .select('id, status')
      .in('participant_id', participantIds)
      .eq('event_id', eventId)
      .in('status', ['pending', 'confirmed']) // Ignore cancelled registrations
      .limit(1)

    if (existingRegs && existingRegs.length > 0) {
      return NextResponse.json({ error: 'Istnieje już zapis dla tego e-maila i imienia psa na to wydarzenie' }, { status: 409 })
    }
  }

  // Create participant
  const { data: participant, error: pError } = await supabase
    .from('participants')
    .insert([{
      dog_name: dogName.trim(),
      dog_breed: dogBreed?.trim() || null,
      owner_name: ownerName.trim(),
      owner_email: ownerEmailNorm,
      user_id: participantUserId,
      dog_id: dogIdNorm,
      extra: {},
    }])
    .select()
    .single()

  if (pError || !participant) {
    return NextResponse.json(
      { error: pError?.message ?? 'Błąd tworzenia uczestnika' },
      { status: 500 }
    )
  }

  const { data: registration, error: rError } = await supabase
    .from('registrations')
    .insert([{
      event_id: eventId,
      participant_id: participant.id,
      status: event.auto_confirm && !isPaidRegistration ? 'confirmed' : 'pending',
      form_data: normalizedExtraFields,
    }])
    .select()
    .single()

  if (rError || !registration) {
    await supabase
      .from('participants')
      .delete()
      .eq('id', participant.id)
    if (rError?.message?.includes('event_capacity_reached')) {
      return NextResponse.json({ error: 'Brak wolnych miejsc na to wydarzenie' }, { status: 409 })
    }
    if (rError?.message?.includes('duplicate_active_registration')) {
      return NextResponse.json(
        { error: 'Istnieje już zapis dla tego e-maila i imienia psa na to wydarzenie' },
        { status: 409 }
      )
    }
    return NextResponse.json(
      { error: rError?.message ?? 'Błąd tworzenia zapisu' },
      { status: 500 }
    )
  }

  let checkoutUrl: string | null = null
  if (isPaidRegistration) {
    const checkoutInput = {
      registration: {
        id: registration.id,
        participant_id: participant.id,
        form_data: registration.form_data ?? {},
      },
      event: {
        ...event,
        created_by: event.created_by as string,
        slug: event.slug as string,
      },
      participant: {
        owner_email: ownerEmailNorm,
        owner_name: ownerName.trim(),
        dog_name: dogName.trim(),
        user_id: participantUserId,
      },
      pendingApproval: !event.auto_confirm,
    }
    try {
      if (event.auto_confirm) {
        const checkout = await createEventCheckout(checkoutInput, req.url)
        checkoutUrl = checkout.checkoutUrl
      } else {
        await prepareEventRegistrationItems(checkoutInput)
      }
    } catch (paymentError) {
      console.error('[event-registration] Failed to prepare payment:', paymentError)
      await Promise.all([
        supabase.from('registrations').delete().eq('id', registration.id),
        supabase.from('participants').delete().eq('id', participant.id),
      ])
      return NextResponse.json({ error: 'Nie udało się przygotować płatności' }, { status: 502 })
    }
  }

  // Send email notification before returning so serverless runtimes do not stop it mid-flight.
  if (!isPaidRegistration || !event.auto_confirm) {
    await sendRegistrationEmail({
      to: ownerEmailNorm,
      ownerName: ownerName.trim(),
      dogName: dogName.trim(),
      eventTitle: event.title,
      eventDate: event.start_at ?? null,
      eventLocation: event.location ?? null,
      status: event.auto_confirm && !isPaidRegistration ? 'confirmed' : 'pending',
      formFields: Array.isArray(event.form_fields) ? event.form_fields : [],
      formData: registration.form_data ?? {},
    })
  }

  return NextResponse.json({ ...registration, checkoutUrl }, { status: 201 })
}
