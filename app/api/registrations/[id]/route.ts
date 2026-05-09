import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabaseServer'
import { checkRoleForApi } from '@/lib/getServerUser'
import { sendRegistrationEmail } from '@/lib/email'

interface Params {
  params: Promise<{ id: string }>
}

export async function PATCH(req: Request, { params }: Params) {
  const { id } = await params
  const authResult = await checkRoleForApi(['organizer', 'admin'])
  if ('error' in authResult) return authResult.error

  const supabase = createServerClient()

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Nieprawidłowe JSON' }, { status: 400 })
  }

  const allowedStatuses = ['pending', 'confirmed', 'cancelled']
  if (body.status && !allowedStatuses.includes(body.status as string)) {
    return NextResponse.json({ error: 'Nieprawidłowy status' }, { status: 400 })
  }

  const update: Record<string, unknown> = {}
  if ('status' in body) update.status = body.status

  const { data, error } = await supabase
    .from('registrations')
    .update(update)
    .eq('id', id)
    .select('*, participants(*), events(*)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Send email when status changes to confirmed
  if (update.status === 'confirmed') {
    const participant = (data as any)?.participants
    const event = (data as any)?.events
    if (participant?.owner_email) {
      sendRegistrationEmail({
        to: participant.owner_email,
        ownerName: participant.owner_name ?? '',
        dogName: participant.dog_name ?? '',
        eventTitle: event?.title ?? '',
        eventDate: event?.start_at ?? null,
        eventLocation: event?.location ?? null,
        status: 'confirmed',
      }).catch(() => {})
    }
  }

  return NextResponse.json(data)
}
