import { NextResponse } from 'next/server'
import { createAuthClient, createServiceRoleClient } from '@/lib/supabaseServer'
import { checkRoleForApi, getServerUser } from '@/lib/getServerUser'
import { bestMs as computeBestMs, computeSpeedKmh, normalizeSizeClass } from '@/lib/speedway'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const eventId = searchParams.get('eventId')
  if (!eventId) {
    return NextResponse.json({ error: 'Wymagane: eventId' }, { status: 400 })
  }

  const supabase = createServiceRoleClient()
  const [{ data: event }, { user, role }] = await Promise.all([
    supabase
      .from('events')
      .select('id, status, results_public, created_by')
      .eq('id', eventId)
      .maybeSingle(),
    getServerUser(),
  ])

  if (!event) return NextResponse.json({ error: 'Nie znaleziono wydarzenia' }, { status: 404 })

  const canManage = role === 'admin' || (user?.id != null && event.created_by === user.id)
  const canReadPublicly = event.status !== 'draft' && event.results_public === true
  if (!canManage && !canReadPublicly) {
    return NextResponse.json({ error: 'Nie znaleziono wyników' }, { status: 404 })
  }

  const { data, error } = await supabase
    .from('results')
    .select('id, event_id, participant_id, time_ms, rank, notes, run1_ms, run2_ms, run1_status, run2_status, best_ms, speed_kmh, size_class, class_rank, participants(dog_name, owner_name, dog_breed)')
    .eq('event_id', eventId)
    .order('rank', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: Request) {
  const authResult = await checkRoleForApi(['organizer', 'admin'])
  if ('error' in authResult) return authResult.error
  const supabase = await createAuthClient()

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
    run1_ms, run2_ms, run1_status, run2_status, size_class,
  } = body as Record<string, unknown>

  if (!eventId || !participantId) {
    return NextResponse.json({ error: 'Wymagane: eventId, participantId' }, { status: 400 })
  }

  const { data: event } = await supabase
    .from('events')
    .select('created_by, track_distance_m')
    .eq('id', eventId as string)
    .maybeSingle()

  if (!event) return NextResponse.json({ error: 'Nie znaleziono wydarzenia' }, { status: 404 })
  if (authResult.role !== 'admin' && event.created_by !== authResult.user.id) {
    return NextResponse.json({ error: 'Brak uprawnień' }, { status: 403 })
  }

  const { data: registration } = await supabase
    .from('registrations')
    .select('id')
    .eq('event_id', eventId as string)
    .eq('participant_id', participantId as string)
    .eq('status', 'confirmed')
    .maybeSingle()

  if (!registration) {
    return NextResponse.json(
      { error: 'Uczestnik nie ma potwierdzonego zgłoszenia na to wydarzenie' },
      { status: 409 },
    )
  }

  if (resultId) {
    const { data: existingResult } = await supabase
      .from('results')
      .select('id, event_id, participant_id')
      .eq('id', resultId as string)
      .maybeSingle()

    if (
      !existingResult ||
      existingResult.event_id !== eventId ||
      existingResult.participant_id !== participantId
    ) {
      return NextResponse.json({ error: 'Wynik nie należy do tego uczestnika i wydarzenia' }, { status: 409 })
    }
  }

  // Compute speedway derived fields
  const r1 = typeof run1_ms === 'number' ? run1_ms : null
  const r2 = typeof run2_ms === 'number' ? run2_ms : null
  const s1 = run1_status === 'DNS' || run1_status === 'DNF' ? run1_status : null
  const s2 = run2_status === 'DNS' || run2_status === 'DNF' ? run2_status : null
  const best = computeBestMs(r1, r2)
  const distM = typeof event.track_distance_m === 'number' ? event.track_distance_m : null
  const speed = best !== null && distM !== null ? computeSpeedKmh(best, distM) : null
  const normalizedSizeClass = normalizeSizeClass(size_class)

  if (size_class != null && !normalizedSizeClass) {
    return NextResponse.json({ error: 'Nieprawidłowa klasa startowa' }, { status: 400 })
  }

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
    size_class: normalizedSizeClass,
  }

  let data, error

  if (resultId) {
    ;({ data, error } = await supabase
      .from('results')
      .update(fields)
      .eq('id', resultId as string)
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
