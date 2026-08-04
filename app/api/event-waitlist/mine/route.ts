import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabaseServer'
import { getServerUser } from '@/lib/getServerUser'

export async function GET(req: Request) {
  const { user } = await getServerUser()
  if (!user?.email) return NextResponse.json({ error: 'Brak uprawnień' }, { status: 401 })

  const eventId = new URL(req.url).searchParams.get('eventId')
  if (!eventId) return NextResponse.json({ error: 'eventId jest wymagany' }, { status: 400 })

  const supabase = createServerClient()
  const [{ data: participantsByUser }, { data: participantsByEmail }] = await Promise.all([
    supabase.from('participants').select('id').eq('user_id', user.id),
    supabase.from('participants').select('id').ilike('owner_email', user.email),
  ])
  const participantIds = [...new Set([
    ...(participantsByUser ?? []).map(participant => participant.id as string),
    ...(participantsByEmail ?? []).map(participant => participant.id as string),
  ])]
  if (participantIds.length === 0) return NextResponse.json([])

  const { data: entries, error } = await supabase
    .from('event_waitlist_entries')
    .select('id, event_id, participant_id, status, offer_expires_at, created_at, participants(dog_name, dog_breed)')
    .eq('event_id', eventId)
    .in('participant_id', participantIds)
    .in('status', ['waiting', 'offered'])
    .order('created_at', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const response = await Promise.all((entries ?? []).map(async entry => {
    const { count } = await supabase
      .from('event_waitlist_entries')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', eventId)
      .in('status', ['waiting', 'offered'])
      .lte('created_at', entry.created_at)
    return { ...entry, position: Math.max(1, count ?? 1) }
  }))

  return NextResponse.json(response)
}
