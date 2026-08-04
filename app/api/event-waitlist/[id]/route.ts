import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabaseServer'
import { getServerUser } from '@/lib/getServerUser'
import { getEventAccess } from '@/lib/eventAccess'
import { tryProcessEventWaitlist } from '@/lib/eventWaitlist'

interface Params {
  params: Promise<{ id: string }>
}

export async function DELETE(_req: Request, { params }: Params) {
  const { id } = await params
  const { user } = await getServerUser()
  if (!user) return NextResponse.json({ error: 'Brak uprawnień' }, { status: 401 })

  const supabase = createServerClient()
  const { data: entry } = await supabase
    .from('event_waitlist_entries')
    .select('id, event_id, status, participants(user_id, owner_email), events(created_by)')
    .eq('id', id)
    .maybeSingle()
  if (!entry) return NextResponse.json({ error: 'Nie znaleziono wpisu' }, { status: 404 })

  const participant = Array.isArray(entry.participants) ? entry.participants[0] : entry.participants
  const ownsEntry = participant?.user_id === user.id
    || participant?.owner_email?.toLowerCase() === user.email?.toLowerCase()
  const managesEvent = Boolean((await getEventAccess(entry.event_id))?.can('registrations'))
  if (!ownsEntry && !managesEvent) return NextResponse.json({ error: 'Brak uprawnień' }, { status: 403 })
  if (!['waiting', 'offered'].includes(entry.status)) {
    return NextResponse.json({ error: 'Tego wpisu nie można już anulować' }, { status: 409 })
  }

  const { data: cancelled } = await supabase
    .from('event_waitlist_entries')
    .update({ status: 'cancelled' })
    .eq('id', id)
    .in('status', ['waiting', 'offered'])
    .select('id')
    .maybeSingle()
  if (!cancelled) return NextResponse.json({ error: 'Wpis został już zmieniony' }, { status: 409 })

  await tryProcessEventWaitlist(entry.event_id)
  return NextResponse.json({ status: 'cancelled' })
}
