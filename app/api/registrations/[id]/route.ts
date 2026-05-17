import { NextResponse } from 'next/server'
import { createAuthClient, createServerClient } from '@/lib/supabaseServer'
import { getServerUser } from '@/lib/getServerUser'
import { sendRegistrationEmail, sendCancellationEmailToOrganizer } from '@/lib/email'

interface Params {
  params: Promise<{ id: string }>
}

export async function PATCH(req: Request, { params }: Params) {
  const { id } = await params
  const supabase = await createAuthClient()

  const { user, role } = await getServerUser()
  if (!user) return NextResponse.json({ error: 'Brak uprawnień' }, { status: 401 })

  const isOrganizerOrAdmin = role === 'organizer' || role === 'admin'

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Nieprawidłowe JSON' }, { status: 400 })
  }

  // Fetch registration + participant to check ownership
  const { data: reg } = await supabase
    .from('registrations')
    .select('*, participants(*), events(*)')
    .eq('id', id)
    .single()

  if (!reg) return NextResponse.json({ error: 'Nie znaleziono' }, { status: 404 })

  const participantEmail = ((reg as Record<string, unknown>).participants as Record<string, string> | null)?.owner_email ?? null
  const isOwner = participantEmail && participantEmail.toLowerCase() === user.email?.toLowerCase()

  if (!isOrganizerOrAdmin && !isOwner) {
    return NextResponse.json({ error: 'Brak uprawnień' }, { status: 403 })
  }

  // Owners can only cancel their own registration
  if (isOwner && !isOrganizerOrAdmin && body.status !== 'cancelled') {
    return NextResponse.json({ error: 'Możesz tylko anulować własny zapis' }, { status: 403 })
  }

  const allowedStatuses = ['pending', 'confirmed', 'cancelled']
  if (body.status && !allowedStatuses.includes(body.status as string)) {
    return NextResponse.json({ error: 'Nieprawidłowy status' }, { status: 400 })
  }

  const update: Record<string, unknown> = {}
  if ('status' in body) update.status = body.status
  // Organizer/admin can also update time_slot_id for schedule management
  if ('time_slot_id' in body && isOrganizerOrAdmin) {
    update.time_slot_id = body.time_slot_id
  }
  // Organizer/admin can toggle check-in
  if ('checked_in' in body && isOrganizerOrAdmin) {
    update.checked_in = Boolean(body.checked_in)
    update.checked_in_at = body.checked_in ? new Date().toISOString() : null
  }

  const { data, error } = await supabase
    .from('registrations')
    .update(update)
    .eq('id', id)
    .select('*, participants(*), events(*)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Send email when organizer confirms a registration
  if (update.status === 'confirmed' && isOrganizerOrAdmin) {
    const participant = (data as Record<string, unknown>).participants as Record<string, string> | null
    const event = (data as Record<string, unknown>).events as Record<string, string> | null
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

  // Send email to organizer when participant cancels their own registration
  if (update.status === 'cancelled' && isOwner && !isOrganizerOrAdmin) {
    const participant = (reg as Record<string, unknown>).participants as Record<string, string> | null
    const event = (reg as Record<string, unknown>).events as Record<string, unknown> | null
    const createdBy = event?.created_by as string | null
    if (createdBy) {
      // Get organizer email via service role (auth.admin)
      const adminClient = createServerClient()
      const { data: orgUser } = await adminClient.auth.admin.getUserById(createdBy)
      const organizerEmail = orgUser?.user?.email
      if (organizerEmail) {
        sendCancellationEmailToOrganizer({
          to: organizerEmail,
          ownerName: participant?.owner_name ?? '',
          dogName: participant?.dog_name ?? '',
          eventTitle: String(event?.title ?? ''),
          eventDate: event?.start_at ? String(event.start_at) : null,
          eventLocation: event?.location ? String(event.location) : null,
          previousStatus: reg.status,
        }).catch(() => {})
      }
    }
  }

  return NextResponse.json(data)
}
