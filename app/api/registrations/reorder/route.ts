import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabaseServer'
import { checkRoleForApi } from '@/lib/getServerUser'

export async function PATCH(req: Request) {
  const authResult = await checkRoleForApi(['organizer', 'admin'])
  if ('error' in authResult) return authResult.error

  const supabase = createServerClient()

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
    if (typeof item.id !== 'string' || typeof item.order_index !== 'number') {
      return NextResponse.json({ error: 'Każdy item musi mieć id (string) i order_index (number)' }, { status: 400 })
    }
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
