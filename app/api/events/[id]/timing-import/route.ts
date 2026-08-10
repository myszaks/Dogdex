import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabaseServer'
import { requireEventAccessForApi } from '@/lib/eventAccess'
import { bestMs, computeStoredSpeedKmh, parseTrackDistanceM } from '@/lib/speedway'

interface Params { params: Promise<{ id: string }> }
type ImportRow = { registrationId?: string; participantId?: string; timeMs?: number | null; run1Ms?: number | null; run2Ms?: number | null; notes?: string | null }

function duration(value: unknown) {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 86_400_000 ? value : null
}

export async function POST(req: Request, { params }: Params) {
  const { id } = await params
  const auth = await requireEventAccessForApi(id, 'results')
  if ('error' in auth) return auth.error
  let body: { sourceName?: string; rows?: ImportRow[] }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Nieprawidłowe JSON' }, { status: 400 })
  }
  if (!Array.isArray(body.rows) || body.rows.length === 0 || body.rows.length > 1000) {
    return NextResponse.json({ error: 'Import musi zawierać od 1 do 1000 wierszy' }, { status: 400 })
  }
  const db = createServerClient()
  const { data: event } = await db.from('events').select('id, status, track_distance_m').eq('id', id).maybeSingle()
  if (!event) return NextResponse.json({ error: 'Nie znaleziono wydarzenia' }, { status: 404 })
  if (event.status === 'finished' || event.status === 'cancelled') return NextResponse.json({ error: 'Wyniki są zablokowane' }, { status: 409 })
  const { data: registrations } = await db.from('registrations').select('id, participant_id').eq('event_id', id).eq('status', 'confirmed')
  const byRegistration = new Map((registrations ?? []).map(row => [row.id, row.participant_id]))
  const participants = new Set((registrations ?? []).map(row => row.participant_id))
  const errors: Array<{ row: number; error: string }> = []
  let imported = 0

  for (const [index, row] of body.rows.entries()) {
    const participantId = row.registrationId ? byRegistration.get(row.registrationId) : row.participantId
    if (!participantId || !participants.has(participantId)) {
      errors.push({ row: index + 2, error: 'Nie znaleziono potwierdzonego uczestnika' })
      continue
    }
    const run1 = duration(row.run1Ms)
    const run2 = duration(row.run2Ms)
    const effectiveBest = bestMs(run1, run2)
    const timeMs = effectiveBest ?? duration(row.timeMs)
    if (timeMs === null) {
      errors.push({ row: index + 2, error: 'Brak prawidłowego czasu w milisekundach' })
      continue
    }
    const distance = parseTrackDistanceM(event.track_distance_m)
    const fields = {
      time_ms: timeMs,
      run1_ms: run1,
      run2_ms: run2,
      best_ms: effectiveBest,
      speed_kmh: effectiveBest !== null && distance !== null ? computeStoredSpeedKmh(effectiveBest, distance) : null,
      notes: typeof row.notes === 'string' ? row.notes.slice(0, 1000) || null : null,
    }
    const { data: existing } = await db.from('results').select('id').eq('event_id', id).eq('participant_id', participantId).maybeSingle()
    const result = existing
      ? await db.from('results').update(fields).eq('id', existing.id)
      : await db.from('results').insert({ event_id: id, participant_id: participantId, ...fields })
    if (result.error) errors.push({ row: index + 2, error: 'Nie udało się zapisać wyniku' })
    else imported += 1
  }
  await db.from('event_timing_imports').insert({
    event_id: id,
    imported_by: auth.access.user.id,
    source_name: typeof body.sourceName === 'string' ? body.sourceName.slice(0, 200) : 'import.csv',
    rows_total: body.rows.length,
    rows_imported: imported,
    rows_rejected: errors.length,
    errors,
  })
  return NextResponse.json({ imported, rejected: errors.length, errors }, { status: imported > 0 ? 200 : 422 })
}
