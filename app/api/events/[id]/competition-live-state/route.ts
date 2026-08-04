import { NextResponse } from 'next/server'
import { requireEventAccessForApi } from '@/lib/eventAccess'
import { createServerClient } from '@/lib/supabaseServer'

interface Params {
  params: Promise<{ id: string }>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export async function POST(req: Request, { params }: Params) {
  const { id: eventId } = await params
  const authResult = await requireEventAccessForApi(eventId, 'results')
  if ('error' in authResult) return authResult.error
  const supabase = createServerClient()

  const { data: event } = await supabase
    .from('events')
    .select('created_by, status, competition_config')
    .eq('id', eventId)
    .maybeSingle()
  if (!event) return NextResponse.json({ error: 'Nie znaleziono wydarzenia.' }, { status: 404 })
  if (!event.competition_config) {
    return NextResponse.json({ error: 'Wydarzenie nie używa uniwersalnego formatu.' }, { status: 409 })
  }
  if (event.status === 'finished' || event.status === 'cancelled') {
    return NextResponse.json({ error: 'Stan wyników na żywo jest zablokowany.' }, { status: 409 })
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Nieprawidłowe JSON' }, { status: 400 })
  }
  const cursor = typeof body.cursor === 'number' && Number.isInteger(body.cursor) && body.cursor >= 0
    ? body.cursor
    : 0
  const currentParticipantId = typeof body.currentParticipantId === 'string'
    ? body.currentParticipantId
    : null
  if (currentParticipantId) {
    const { data: registration } = await supabase
      .from('registrations')
      .select('id')
      .eq('event_id', eventId)
      .eq('participant_id', currentParticipantId)
      .eq('status', 'confirmed')
      .maybeSingle()
    if (!registration) {
      return NextResponse.json({ error: 'Zawodnik nie należy do wydarzenia.' }, { status: 400 })
    }
  }

  const payload = {
    event_id: eventId,
    view_id: typeof body.viewId === 'string' ? body.viewId : null,
    phase: typeof body.phase === 'string' ? body.phase : null,
    current_stage_id: typeof body.currentStageId === 'string' ? body.currentStageId : null,
    current_attempt_id: typeof body.currentAttemptId === 'string' ? body.currentAttemptId : null,
    current_participant_id: currentParticipantId,
    cursor,
    state: isRecord(body.state) ? body.state : {},
    updated_by: authResult.access.user.id,
    updated_at: new Date().toISOString(),
  }
  const { data, error } = await supabase
    .from('competition_live_state')
    .upsert(payload, { onConflict: 'event_id' })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
