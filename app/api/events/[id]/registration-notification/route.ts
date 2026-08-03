import { NextResponse } from 'next/server'
import { createAuthClient } from '@/lib/supabaseServer'
import { getServerUser } from '@/lib/getServerUser'

interface Params {
  params: Promise<{ id: string }>
}

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params
  const { user } = await getServerUser()
  if (!user) return NextResponse.json({ subscribed: false }, { status: 401 })

  const supabase = await createAuthClient()
  const { data, error } = await supabase
    .from('event_registration_notifications')
    .select('id, notified_at')
    .eq('event_id', id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: 'Nie udało się sprawdzić powiadomienia' }, { status: 500 })
  }
  return NextResponse.json({ subscribed: Boolean(data), notified: Boolean(data?.notified_at) })
}

export async function POST(_req: Request, { params }: Params) {
  const { id } = await params
  const { user } = await getServerUser()
  if (!user?.email) return NextResponse.json({ error: 'Zaloguj się, aby włączyć powiadomienie' }, { status: 401 })

  const supabase = await createAuthClient()
  const { data: event, error: eventError } = await supabase
    .from('events')
    .select('id, status, registration_opens_at')
    .eq('id', id)
    .maybeSingle()

  if (eventError || !event) {
    return NextResponse.json({ error: 'Nie znaleziono wydarzenia' }, { status: 404 })
  }
  if (
    event.status !== 'upcoming'
    || !event.registration_opens_at
    || new Date(event.registration_opens_at).getTime() <= Date.now()
  ) {
    return NextResponse.json({ error: 'Zapisy na to wydarzenie nie oczekują już na otwarcie' }, { status: 409 })
  }

  const { data, error } = await supabase
    .from('event_registration_notifications')
    .insert({ event_id: id, user_id: user.id, email: user.email })
    .select('id')
    .single()

  if (error?.code === '23505') return NextResponse.json({ subscribed: true })
  if (error) {
    return NextResponse.json({ error: 'Nie udało się włączyć powiadomienia' }, { status: 500 })
  }
  return NextResponse.json({ subscribed: true, id: data.id }, { status: 201 })
}

export async function DELETE(_req: Request, { params }: Params) {
  const { id } = await params
  const { user } = await getServerUser()
  if (!user) return NextResponse.json({ error: 'Brak uprawnień' }, { status: 401 })

  const supabase = await createAuthClient()
  const { error } = await supabase
    .from('event_registration_notifications')
    .delete()
    .eq('event_id', id)
    .eq('user_id', user.id)

  if (error) {
    return NextResponse.json({ error: 'Nie udało się wyłączyć powiadomienia' }, { status: 500 })
  }
  return NextResponse.json({ subscribed: false })
}
