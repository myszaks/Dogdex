import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabaseServer'
import { requireEventAccessForApi } from '@/lib/eventAccess'

export async function PATCH(req: Request) {
  const supabase = createServerClient()

  let body: { items?: { id: string; order_index: number }[] }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Nieprawidłowe JSON' }, { status: 400 })
  }

  if (!Array.isArray(body.items) || body.items.length === 0 || body.items.length > 1000) {
    return NextResponse.json({ error: 'items musi być niepustą tablicą' }, { status: 400 })
  }

  // Validate each item
  for (const item of body.items) {
    if (
      typeof item.id !== 'string'
      || !Number.isInteger(item.order_index)
      || item.order_index < 0
    ) {
      return NextResponse.json({ error: 'Każdy item musi mieć id (string) i order_index (number)' }, { status: 400 })
    }
  }

  const ids = [...new Set(body.items.map(item => item.id))]
  if (ids.length !== body.items.length) {
    return NextResponse.json({ error: 'Lista zawiera powtórzone identyfikatory' }, { status: 400 })
  }

  const { data: registrations, error: registrationsError } = await supabase
    .from('registrations')
    .select('id, event_id')
    .in('id', ids)

  if (registrationsError) {
    return NextResponse.json({ error: 'Nie udało się zweryfikować zapisów' }, { status: 500 })
  }
  if ((registrations ?? []).length !== ids.length) {
    return NextResponse.json({ error: 'Nie znaleziono części zapisów' }, { status: 404 })
  }

  const eventIds = [...new Set((registrations ?? []).map(registration => registration.event_id as string))]
  if (eventIds.length !== 1) return NextResponse.json({ error: 'Zapisy muszą należeć do jednego wydarzenia' }, { status: 400 })
  const authResult = await requireEventAccessForApi(eventIds[0], ['registrations', 'results'])
  if ('error' in authResult) return authResult.error

  // Update each registration's order_index in parallel
  const updates = body.items.map(({ id, order_index }) =>
    supabase.from('registrations').update({ order_index }).eq('id', id)
  )

  const results = await Promise.all(updates)
  const failed = results.find(r => r.error)
  if (failed?.error) {
    return NextResponse.json({ error: failed.error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
