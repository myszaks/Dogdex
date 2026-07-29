import { NextResponse } from 'next/server'
import { createAuthClient } from '@/lib/supabaseServer'

export async function GET() {
  const supabase = await createAuthClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Brak autoryzacji' }, { status: 401 })

  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, company, role, created_at, event_creator_tutorial_seen_at')
    .eq('id', user.id)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ...data, email: user.email })
}

export async function PATCH(req: Request) {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Brak autoryzacji' }, { status: 401 })

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Nieprawidłowe JSON' }, { status: 400 })
  }

  // Only allow updating safe fields
  const allowed: Record<string, unknown> = {}
  if (typeof body.full_name === 'string') allowed.full_name = body.full_name.trim().slice(0, 100)
  if (typeof body.company === 'string') allowed.company = body.company.trim().slice(0, 100)
  if (body.event_creator_tutorial_seen === true) {
    allowed.event_creator_tutorial_seen_at = new Date().toISOString()
  }

  if (Object.keys(allowed).length === 0) {
    return NextResponse.json({ error: 'Brak pól do aktualizacji' }, { status: 400 })
  }

  const { data, error } = await auth
    .from('profiles')
    .update(allowed)
    .eq('id', user.id)
    .select('id, full_name, company, role, event_creator_tutorial_seen_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
