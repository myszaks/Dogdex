import { NextResponse } from 'next/server'
import { createAuthClient } from '@/lib/supabaseServer'
import { checkRoleForApi } from '@/lib/getServerUser'

interface Params {
  params: Promise<{ id: string }>
}

/** GET /api/events/[id]/schedule-assignments
 *  Returns all schedule_assignments whose registration belongs to this event.
 */
export async function GET(_req: Request, { params }: Params) {
  const { id } = await params
  const supabase = await createAuthClient()

  // Get registration IDs for this event
  const { data: regs } = await supabase
    .from('registrations')
    .select('id')
    .eq('event_id', id)

  const regIds = (regs ?? []).map((r: { id: string }) => r.id)
  if (regIds.length === 0) return NextResponse.json([])

  const { data, error } = await supabase
    .from('schedule_assignments')
    .select('*')
    .in('registration_id', regIds)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

/** POST /api/events/[id]/schedule-assignments
 *  Body: { registration_id, time_slot_id, item_date? }
 *  Upserts: one slot per (registration_id, item_date).
 */
export async function POST(req: Request, { params }: Params) {
  const { id } = await params

  const authResult = await checkRoleForApi(['organizer', 'admin'])
  if ('error' in authResult) return authResult.error

  const supabase = await createAuthClient()

  const { data: event } = await supabase.from('events').select('created_by').eq('id', id).single()
  if (!event) return NextResponse.json({ error: 'Nie znaleziono eventu' }, { status: 404 })
  if (authResult.role !== 'admin' && event.created_by !== authResult.user.id)
    return NextResponse.json({ error: 'Brak uprawnień' }, { status: 403 })

  let body: { registration_id: string; time_slot_id: string; item_date?: string }
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Nieprawidłowe JSON' }, { status: 400 }) }

  const { registration_id, time_slot_id, item_date = '' } = body
  if (!registration_id || !time_slot_id)
    return NextResponse.json({ error: 'Wymagane: registration_id, time_slot_id' }, { status: 400 })

  const { data, error } = await supabase
    .from('schedule_assignments')
    .upsert(
      { registration_id, time_slot_id, item_date },
      { onConflict: 'registration_id,item_date' }
    )
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

/** DELETE /api/events/[id]/schedule-assignments
 *  Body: { assignment_id }
 */
export async function DELETE(req: Request, { params }: Params) {
  const { id } = await params

  const authResult = await checkRoleForApi(['organizer', 'admin'])
  if ('error' in authResult) return authResult.error

  const supabase = await createAuthClient()

  const { data: event } = await supabase.from('events').select('created_by').eq('id', id).single()
  if (!event) return NextResponse.json({ error: 'Nie znaleziono eventu' }, { status: 404 })
  if (authResult.role !== 'admin' && event.created_by !== authResult.user.id)
    return NextResponse.json({ error: 'Brak uprawnień' }, { status: 403 })

  let body: { assignment_id: string }
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Nieprawidłowe JSON' }, { status: 400 }) }

  const { error } = await supabase
    .from('schedule_assignments')
    .delete()
    .eq('id', body.assignment_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
