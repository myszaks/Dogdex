import { NextResponse } from 'next/server'
import { createAuthClient, createServerClient } from '@/lib/supabaseServer'
import { requireEventAccessForApi } from '@/lib/eventAccess'

interface Params {
  params: Promise<{ id: string }>
}

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params
  const supabase = await createAuthClient()

  const { data, error } = await supabase
    .from('time_slots')
    .select('*')
    .eq('event_id', id)
    .order('slot_date', { ascending: true })
    .order('slot_time', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: Request, { params }: Params) {
  const { id } = await params

  const authResult = await requireEventAccessForApi(id, ['registrations', 'results'])
  if ('error' in authResult) return authResult.error
  const supabase = createServerClient()

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Nieprawidłowe JSON' }, { status: 400 })
  }

  const { slot_date, slot_time, label, max_participants } = body as {
    slot_date: string
    slot_time: string
    label?: string
    max_participants?: number | null
  }

  if (!slot_date || !slot_time) {
    return NextResponse.json({ error: 'Wymagane: slot_date, slot_time' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('time_slots')
    .insert([{
      event_id: id,
      slot_date,
      slot_time,
      label: label ?? null,
      max_participants: max_participants ?? null,
    }])
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
