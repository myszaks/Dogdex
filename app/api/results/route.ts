import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabaseServer'
import { getServerUser } from '@/lib/getServerUser'
import { getEventAccess, requireEventAccessForApi } from '@/lib/eventAccess'
import {
  bestMs as computeBestMs,
  computeStoredSpeedKmh,
  isValidTrackDistanceM,
  parseTrackDistanceM,
} from '@/lib/speedway'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const eventId = searchParams.get('eventId')
  if (!eventId) {
    return NextResponse.json({ error: 'Brak eventId' }, { status: 400 })
  }

  const supabase = createServerClient()
  const { data: event } = await supabase
    .from('events')
    .select('id, event_type_id, created_by, status, results_public')
    .eq('id', eventId)
    .maybeSingle()

  if (!event) return NextResponse.json({ error: 'Nie znaleziono wydarzenia' }, { status: 404 })

  const { user } = await getServerUser()
  const access = user ? await getEventAccess(eventId) : null
  const canManage = Boolean(access?.can('results'))
  if ((event.status === 'draft' || !event.results_public) && !canManage) {
    return NextResponse.json({ error: 'Nie znaleziono wyników' }, { status: 404 })
  }

  const query = supabase
    .from('results')
    .select('*, participants(dog_name, owner_name, dog_breed)')
    .eq('event_id', eventId)
    .order('rank', { ascending: true })

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (event.event_type_id === 'speedway') {
    const { data: checkedInRegistrations, error: checkedInError } = await supabase
      .from('registrations')
      .select('participant_id')
      .eq('event_id', eventId)
      .eq('status', 'confirmed')
      .eq('checked_in', true)

    if (checkedInError) return NextResponse.json({ error: checkedInError.message }, { status: 500 })

    const checkedInParticipantIds = new Set(
      (checkedInRegistrations ?? []).map(reg => reg.participant_id as string)
    )
    return NextResponse.json((data ?? []).filter((row: any) =>
      checkedInParticipantIds.has(row.participant_id as string)
    ))
  }

  return NextResponse.json(data)
}

export async function POST(req: Request) {
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Nieprawidłowe JSON' }, { status: 400 })
  }

  const {
    eventId, participantId, resultId,
    time_ms, rank, notes,
    // Speedway-specific
    run1_ms, run2_ms, run1_status, run2_status, size_class, track_distance_m,
  } = body as Record<string, unknown>

  if (!eventId || !participantId) {
    return NextResponse.json({ error: 'Wymagane: eventId, participantId' }, { status: 400 })
  }
  const authResult = await requireEventAccessForApi(eventId as string, 'results')
  if ('error' in authResult) return authResult.error
  const supabase = createServerClient()

  const { data: event, error: eventError } = await supabase
    .from('events')
    .select('created_by, status, track_distance_m, event_type_id')
    .eq('id', eventId as string)
    .single()

  if (eventError || !event) {
    return NextResponse.json({ error: 'Nie znaleziono wydarzenia' }, { status: 404 })
  }


  if (event.status === 'finished' || event.status === 'cancelled') {
    return NextResponse.json(
      { error: 'Zawody są zakończone. Edycja wyników jest zablokowana.' },
      { status: 409 },
    )
  }

  const { data: registration, error: registrationError } = await supabase
    .from('registrations')
    .select('id, status, checked_in')
    .eq('event_id', eventId as string)
    .eq('participant_id', participantId as string)
    .maybeSingle()

  if (registrationError) {
    return NextResponse.json({ error: registrationError.message }, { status: 500 })
  }

  if (!registration || registration.status !== 'confirmed') {
    return NextResponse.json(
      { error: 'Wyniki można zapisywać tylko dla potwierdzonych uczestników tego wydarzenia.' },
      { status: 409 },
    )
  }

  if (event.event_type_id === 'speedway' && !registration.checked_in) {
    return NextResponse.json(
      { error: 'Najpierw odpraw psa. Nieodprawione psy nie trafiają na listę startową ani wynikową.' },
      { status: 409 },
    )
  }

  // Compute speedway derived fields
  const r1 = typeof run1_ms === 'number' ? run1_ms : null
  const r2 = typeof run2_ms === 'number' ? run2_ms : null
  const s1 = run1_status === 'DNS' || run1_status === 'DNF' ? run1_status : null
  const s2 = run2_status === 'DNS' || run2_status === 'DNF' ? run2_status : null
  const best = computeBestMs(r1, r2)
  const eventDistanceM = parseTrackDistanceM(event.track_distance_m)
  const payloadDistanceM = parseTrackDistanceM(track_distance_m)
  const distM = isValidTrackDistanceM(eventDistanceM)
    ? eventDistanceM
    : isValidTrackDistanceM(payloadDistanceM)
      ? payloadDistanceM
      : null
  const speed = best !== null && distM !== null ? computeStoredSpeedKmh(best, distM) : null

  // For speedway, time_ms = best_ms (backward compat with public display)
  const effectiveTimeMs = best !== null ? best : (typeof time_ms === 'number' ? time_ms : null)

  const fields = {
    time_ms: effectiveTimeMs,
    rank: typeof rank === 'number' ? rank : null,
    notes: typeof notes === 'string' ? notes || null : null,
    run1_ms: r1,
    run2_ms: r2,
    run1_status: s1,
    run2_status: s2,
    best_ms: best,
    speed_kmh: speed,
    size_class: typeof size_class === 'string' ? size_class : null,
  }

  let data, error

  if (resultId) {
    ;({ data, error } = await supabase
      .from('results')
      .update(fields)
      .eq('id', resultId as string)
      .eq('event_id', eventId as string)
      .eq('participant_id', participantId as string)
      .select()
      .single())
  } else {
    ;({ data, error } = await supabase
      .from('results')
      .insert([{ event_id: eventId as string, participant_id: participantId as string, ...fields }])
      .select()
      .single())
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: resultId ? 200 : 201 })
}
