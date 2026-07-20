import { NextResponse } from 'next/server'
import { createAuthClient } from '@/lib/supabaseServer'
import { checkRoleForApi } from '@/lib/getServerUser'
import { bestMs as computeBestMs, computeSpeedKmh, normalizeSizeClass } from '@/lib/speedway'

export async function GET(req: Request) {
  const supabase = await createAuthClient()
  const { searchParams } = new URL(req.url)
  const eventId = searchParams.get('eventId')

  let query = supabase
    .from('results')
    .select('*, participants(dog_name, owner_name, dog_breed)')
    .order('rank', { ascending: true })

  if (eventId) query = query.eq('event_id', eventId)

  const { data, error } = await query
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
    run1_ms, run2_ms, run1_status, run2_status, size_class, track_distance_m,
  } = body as Record<string, unknown>

  if (!eventId || !participantId) {
    return NextResponse.json({ error: 'Wymagane: eventId, participantId' }, { status: 400 })
  }

  // Compute speedway derived fields
  const r1 = typeof run1_ms === 'number' ? run1_ms : null
  const r2 = typeof run2_ms === 'number' ? run2_ms : null
  const s1 = run1_status === 'DNS' || run1_status === 'DNF' ? run1_status : null
  const s2 = run2_status === 'DNS' || run2_status === 'DNF' ? run2_status : null
  const best = computeBestMs(r1, r2)
  const distM = typeof track_distance_m === 'number' ? track_distance_m : null
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
