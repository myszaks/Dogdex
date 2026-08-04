import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabaseServer'
import { requireEventAccessForApi } from '@/lib/eventAccess'

interface Params {
  params: Promise<{ id: string; slotId: string }>
}

export async function DELETE(_req: Request, { params }: Params) {
  const { id, slotId } = await params

  const authResult = await requireEventAccessForApi(id, ['registrations', 'results'])
  if ('error' in authResult) return authResult.error
  const supabase = createServerClient()

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

  const authResult = await requireEventAccessForApi(id, ['registrations', 'results'])
  if ('error' in authResult) return authResult.error
  const supabase = createServerClient()

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
