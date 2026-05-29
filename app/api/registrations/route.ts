import { NextResponse } from 'next/server'
import { createAuthClient, createServerClient } from '@/lib/supabaseServer'
import { checkRoleForApi } from '@/lib/getServerUser'
import { sendRegistrationEmail } from '@/lib/email'

export async function GET(req: Request) {
  const auth = await checkRoleForApi(['organizer', 'admin'])
  if ('error' in auth) return auth.error

  const supabase = await createAuthClient()
  const { searchParams } = new URL(req.url)
  const eventId = searchParams.get('eventId')

  let query = supabase
    .from('registrations')
    .select('*, participants(*)')
    .order('created_at', { ascending: true })

  if (eventId) query = query.eq('event_id', eventId)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: Request) {
  // Public endpoint — uses service role to bypass RLS so unauthenticated users can register
  const supabase = createServerClient()

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

  if (!eventId || !dogName?.trim() || !ownerName?.trim()) {
    return NextResponse.json(
      { error: 'Wymagane pola: eventId, ownerName, dogName' },
      { status: 400 }
    )
  }

  // Verify event exists and is open
  const { data: event } = await supabase
    .from('events')
    .select('id, status, auto_confirm, max_participants, title, start_at, location, form_fields')
    .eq('id', eventId)
    .single()

  if (!event) return NextResponse.json({ error: 'Wydarzenie nie istnieje' }, { status: 404 })
  if (event.status !== 'upcoming') {
    return NextResponse.json({ error: 'Zapisy na to wydarzenie są zamknięte' }, { status: 409 })
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
  const ownerEmailNorm = ownerEmail?.trim().toLowerCase() || null
  const dogNameTrim = dogName.trim()
  if (ownerEmailNorm) {
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
  }

  // Create participant
  const { data: participant, error: pError } = await supabase
    .from('participants')
    .insert([{
      dog_name: dogName.trim(),
      dog_breed: dogBreed?.trim() || null,
      owner_name: ownerName.trim(),
      owner_email: ownerEmail?.trim() || null,
      dog_id: dogId || null,
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

  // Create registration — store dynamic form fields in form_data
  // Normalize extraFields: accept arrays or CSV strings (compatibility)
  const normalized: Record<string, unknown> = {}
  if (extraFields && typeof extraFields === 'object') {
    for (const [k, v] of Object.entries(extraFields as Record<string, unknown>)) {
      if (typeof v === 'string' && v.includes(',')) {
        normalized[k] = (v as string).split(',').map(s => s.trim()).filter(Boolean)
      } else {
        normalized[k] = v
      }
    }
  }

  const { data: registration, error: rError } = await supabase
    .from('registrations')
    .insert([{
      event_id: eventId,
      participant_id: participant.id,
      status: event.auto_confirm ? 'confirmed' : 'pending',
      form_data: Object.keys(normalized).length ? normalized : (extraFields ?? {}),
    }])
    .select()
    .single()

  if (rError || !registration) {
    return NextResponse.json(
      { error: rError?.message ?? 'Błąd tworzenia zapisu' },
      { status: 500 }
    )
  }

  // Send email notification (fire-and-forget)
  if (ownerEmail?.trim()) {
    sendRegistrationEmail({
      to: ownerEmail.trim(),
      ownerName: ownerName.trim(),
      dogName: dogName.trim(),
      eventTitle: event.title,
      eventDate: event.start_at ?? null,
      eventLocation: event.location ?? null,
      status: event.auto_confirm ? 'confirmed' : 'pending',
      formFields: Array.isArray(event.form_fields) ? event.form_fields : [],
      formData: registration.form_data ?? {},
    }).catch(() => {})
  }

  return NextResponse.json(registration, { status: 201 })
}
