import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabaseServer'
import { checkRoleForApi } from '@/lib/getServerUser'

export async function GET(req: Request) {
  const supabase = createServerClient()
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
  const supabase = createServerClient()

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Nieprawidłowe JSON' }, { status: 400 })
  }

  const { eventId, participantId, resultId, time_ms, rank, notes } =
    body as Record<string, unknown>

  if (!eventId || !participantId) {
    return NextResponse.json({ error: 'Wymagane: eventId, participantId' }, { status: 400 })
  }

  let data, error

  if (resultId) {
    // Update existing result
    ;({ data, error } = await supabase
      .from('results')
      .update({ time_ms: time_ms ?? null, rank: rank ?? null, notes: notes ?? null })
      .eq('id', resultId as string)
      .select()
      .single())
  } else {
    // Insert new result
    ;({ data, error } = await supabase
      .from('results')
      .insert([{
        event_id: eventId as string,
        participant_id: participantId as string,
        time_ms: time_ms ?? null,
        rank: rank ?? null,
        notes: notes ?? null,
      }])
      .select()
      .single())
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: resultId ? 200 : 201 })
}
