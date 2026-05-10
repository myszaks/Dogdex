import { NextResponse } from 'next/server'
import { createAuthClient } from '@/lib/supabaseServer'
import { checkRoleForApi } from '@/lib/getServerUser'

interface Params {
  params: Promise<{ id: string; slotId: string }>
}

export async function DELETE(_req: Request, { params }: Params) {
  const { id, slotId } = await params

  const authResult = await checkRoleForApi(['organizer', 'admin'])
  if ('error' in authResult) return authResult.error

  const supabase = await createAuthClient()

  // Verify event ownership
  const { data: event } = await supabase
    .from('events')
    .select('created_by')
    .eq('id', id)
    .single()

  if (!event) return NextResponse.json({ error: 'Nie znaleziono eventu' }, { status: 404 })
  if (authResult.role !== 'admin' && event.created_by !== authResult.user.id) {
    return NextResponse.json({ error: 'Brak uprawnień' }, { status: 403 })
  }

  const { error } = await supabase
    .from('time_slots')
    .delete()
    .eq('id', slotId)
    .eq('event_id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function PATCH(req: Request, { params }: Params) {
  const { id, slotId } = await params

  const authResult = await checkRoleForApi(['organizer', 'admin'])
  if ('error' in authResult) return authResult.error

  const supabase = await createAuthClient()

  const { data: event } = await supabase
    .from('events')
    .select('created_by')
    .eq('id', id)
    .single()

  if (!event) return NextResponse.json({ error: 'Nie znaleziono eventu' }, { status: 404 })
  if (authResult.role !== 'admin' && event.created_by !== authResult.user.id) {
    return NextResponse.json({ error: 'Brak uprawnień' }, { status: 403 })
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Nieprawidłowe JSON' }, { status: 400 })
  }

  const allowed = ['slot_date', 'slot_time', 'label', 'max_participants']
  const update: Record<string, unknown> = {}
  for (const field of allowed) {
    if (field in body) update[field] = body[field]
  }

  const { data, error } = await supabase
    .from('time_slots')
    .update(update)
    .eq('id', slotId)
    .eq('event_id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
