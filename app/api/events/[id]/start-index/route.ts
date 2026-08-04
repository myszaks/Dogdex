import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabaseServer'
import { requireEventAccessForApi } from '@/lib/eventAccess'

interface Params {
  params: Promise<{ id: string }>
}

export async function PATCH(req: Request, { params }: Params) {
  const { id } = await params

  const authResult = await requireEventAccessForApi(id, 'results')
  if ('error' in authResult) return authResult.error
  const supabase = createServerClient()

  let body: { action?: 'next' | 'prev' | 'set'; value?: number }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Nieprawidłowe JSON' }, { status: 400 })
  }

  const { data: event } = await supabase
    .from('events')
    .select('created_by, current_start_index, status')
    .eq('id', id)
    .single()

  if (!event) return NextResponse.json({ error: 'Nie znaleziono' }, { status: 404 })

  if (event.status === 'finished' || event.status === 'cancelled') {
    return NextResponse.json(
      { error: 'Zawody są zakończone. Kolejka startowa jest zablokowana.' },
      { status: 409 },
    )
  }

  const current = event.current_start_index ?? 0
  let newIndex: number

  if (body.action === 'next') {
    newIndex = current + 1
  } else if (body.action === 'prev') {
    newIndex = Math.max(0, current - 1)
  } else if (body.action === 'set' && typeof body.value === 'number') {
    newIndex = Math.max(0, body.value)
  } else {
    return NextResponse.json({ error: 'Nieprawidłowa akcja (next/prev/set)' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('events')
    .update({ current_start_index: newIndex })
    .eq('id', id)
    .select('current_start_index')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
