import { NextResponse } from 'next/server'
import { createAuthClient } from '@/lib/supabaseServer'
import { checkRoleForApi } from '@/lib/getServerUser'

export async function PATCH(req: Request) {
  const authResult = await checkRoleForApi(['organizer', 'admin'])
  if ('error' in authResult) return authResult.error

  const supabase = await createAuthClient()

  let body: { items?: { id: string; order_index: number }[] }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Nieprawidłowe JSON' }, { status: 400 })
  }

  if (!Array.isArray(body.items) || body.items.length === 0) {
    return NextResponse.json({ error: 'items musi być niepustą tablicą' }, { status: 400 })
  }

  // Validate each item
  for (const item of body.items) {
    if (
      typeof item.id !== 'string' ||
      !Number.isInteger(item.order_index) ||
      item.order_index < 0
    ) {
      return NextResponse.json({ error: 'Każdy item musi mieć id (string) i order_index (number)' }, { status: 400 })
    }
  }

  const itemIds = body.items.map(item => item.id)
  if (new Set(itemIds).size !== itemIds.length) {
    return NextResponse.json({ error: 'Lista zawiera powtórzone zgłoszenia' }, { status: 400 })
  }

  const { data: registrations, error: registrationsError } = await supabase
    .from('registrations')
    .select('id, events(created_by)')
    .in('id', itemIds)

  if (registrationsError) {
    return NextResponse.json({ error: registrationsError.message }, { status: 500 })
  }
  if ((registrations ?? []).length !== itemIds.length) {
    return NextResponse.json({ error: 'Nie znaleziono części zgłoszeń' }, { status: 404 })
  }

  const unauthorized = (registrations ?? []).some(registration => {
    const relation = registration.events
    const event = (Array.isArray(relation) ? relation[0] : relation) as { created_by?: string } | null
    return authResult.role !== 'admin' && event?.created_by !== authResult.user.id
  })
  if (unauthorized) {
    return NextResponse.json({ error: 'Brak uprawnień' }, { status: 403 })
  }

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
