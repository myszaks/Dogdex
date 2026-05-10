import { NextResponse } from 'next/server'
import { createAuthClient } from '@/lib/supabaseServer'
import { getServerUser } from '@/lib/getServerUser'

export async function GET(req: Request) {
  const { user } = await getServerUser()
  if (!user?.email) {
    return NextResponse.json(null, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const eventId = searchParams.get('eventId')
  if (!eventId) {
    return NextResponse.json({ error: 'eventId wymagany' }, { status: 400 })
  }

  const supabase = await createAuthClient()

  // Find all participants with this email
  const { data: participants } = await supabase
    .from('participants')
    .select('id')
    .ilike('owner_email', user.email)

  if (!participants?.length) {
    return NextResponse.json(null)
  }

  const participantIds = participants.map(p => p.id)

  // Find registration for this event (excluding cancelled)
  const { data: reg } = await supabase
    .from('registrations')
    .select('*, participants(*)')
    .eq('event_id', eventId)
    .in('participant_id', participantIds)
    .neq('status', 'cancelled')
    .maybeSingle()

  return NextResponse.json(reg ?? null)
}
