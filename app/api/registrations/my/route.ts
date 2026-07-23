import { NextResponse } from 'next/server'
import { createAuthClient } from '@/lib/supabaseServer'
import { getServerUser } from '@/lib/getServerUser'

export async function GET(req: Request) {
  const { user } = await getServerUser()
  if (!user?.email) {
    return NextResponse.json(null, {
      status: 401,
      headers: { 'Cache-Control': 'private, no-store' },
    })
  }

  const { searchParams } = new URL(req.url)
  const eventId = searchParams.get('eventId')
  if (!eventId) {
    return NextResponse.json(
      { error: 'eventId wymagany' },
      { status: 400, headers: { 'Cache-Control': 'private, no-store' } }
    )
  }

  const supabase = await createAuthClient()

  const participantIds = new Set<string>()

  // Find participants linked directly to this user, old records matched by email,
  // and records linked to one of the user's dogs.
  const [{ data: participantsByUser }, { data: participantsByEmail }, { data: dogs }] = await Promise.all([
    supabase
      .from('participants')
      .select('id')
      .eq('user_id', user.id),
    supabase
      .from('participants')
      .select('id')
      .ilike('owner_email', user.email),
    supabase
      .from('dogs')
      .select('id')
      .eq('user_id', user.id),
  ])

  for (const participant of participantsByUser ?? []) participantIds.add(participant.id as string)
  for (const participant of participantsByEmail ?? []) participantIds.add(participant.id as string)

  const dogIds = (dogs ?? []).map(dog => dog.id as string)
  if (dogIds.length > 0) {
    const { data: participantsByDog } = await supabase
      .from('participants')
      .select('id')
      .in('dog_id', dogIds)

    for (const participant of participantsByDog ?? []) participantIds.add(participant.id as string)
  }

  if (participantIds.size === 0) {
    return NextResponse.json([], {
      headers: { 'Cache-Control': 'private, no-store' },
    })
  }

  // Find all registrations for this event (excluding cancelled).
  const { data: registrations } = await supabase
    .from('registrations')
    .select('*, participants(*)')
    .eq('event_id', eventId)
    .in('participant_id', [...participantIds])
    .neq('status', 'cancelled')
    .order('created_at', { ascending: true })

  const registrationIds = (registrations ?? []).map(reg => reg.id as string)
  if (registrationIds.length === 0) {
    return NextResponse.json([], {
      headers: { 'Cache-Control': 'private, no-store' },
    })
  }

  const { data: pendingCancellationRequests } = await supabase
    .from('cancellation_requests')
    .select('*')
    .in('registration_id', registrationIds)
    .eq('status', 'pending')

  const pendingByRegistrationId = new Map(
    (pendingCancellationRequests ?? []).map(req => [req.registration_id as string, req])
  )

  return NextResponse.json(
    (registrations ?? []).map(reg => ({
      ...reg,
      pending_cancellation_request: pendingByRegistrationId.get(reg.id as string) ?? null,
    })),
    { headers: { 'Cache-Control': 'private, no-store' } }
  )
}
