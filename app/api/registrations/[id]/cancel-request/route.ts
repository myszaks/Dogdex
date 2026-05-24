import { NextResponse } from 'next/server'
import { createAuthClient, createServerClient } from '@/lib/supabaseServer'
import { getServerUser } from '@/lib/getServerUser'
import { sendCancellationRequestEmailToOrganizer } from '@/lib/email'

interface Params {
  params: Promise<{ id: string }>
}

/**
 * POST /api/registrations/[id]/cancel-request
 *
 * Body: { cancelled_dates?: string[] }
 *   - cancelled_dates omitted or null → request to cancel the whole registration
 *   - cancelled_dates = ["2025-06-01", ...] → request to cancel specific multidate entries
 *
 * 24-hour rule: each date (or event.start_at for non-multidate) must be > 24 h in the future.
 * Only the registration owner can call this.
 * A pending request already existing for the same registration blocks creating another.
 */
export async function POST(req: Request, { params }: Params) {
  const { id: registrationId } = await params

  const supabase = await createAuthClient()
  const { user } = await getServerUser()
  if (!user) return NextResponse.json({ error: 'Brak uprawnień' }, { status: 401 })

  // Fetch registration + event + participant
  const { data: reg } = await supabase
    .from('registrations')
    .select('*, participants(*), events(*)')
    .eq('id', registrationId)
    .single()

  if (!reg) return NextResponse.json({ error: 'Nie znaleziono zgłoszenia' }, { status: 404 })

  const participant = (reg as Record<string, unknown>).participants as Record<string, string> | null
  const event = (reg as Record<string, unknown>).events as Record<string, unknown> | null

  // Only the owner may create a cancel request
  const isOwner =
    participant?.owner_email &&
    participant.owner_email.toLowerCase() === user.email?.toLowerCase()
  if (!isOwner) return NextResponse.json({ error: 'Brak uprawnień' }, { status: 403 })

  // Registration must be active
  if (reg.status === 'cancelled') {
    return NextResponse.json({ error: 'Zgłoszenie jest już anulowane' }, { status: 400 })
  }

  // Parse body
  let body: { cancelled_dates?: string[] | null } = {}
  try {
    body = await req.json()
  } catch {
    // empty body is fine — means full cancellation
  }

  const cancelledDates: string[] | null = body.cancelled_dates?.length
    ? body.cancelled_dates
    : null

  // ── 24-hour rule ──────────────────────────────────────────────────────────
  const now = new Date()
  const cutoff = new Date(now.getTime() + 24 * 60 * 60 * 1000)

  if (cancelledDates) {
    // Multidate: check each requested date
    for (const d of cancelledDates) {
      const dt = new Date(d)
      if (dt <= cutoff) {
        return NextResponse.json(
          { error: `Nie można anulować terminu ${d} – pozostało mniej niż 24 godziny` },
          { status: 400 }
        )
      }
    }
  } else {
    // Full cancellation: check event.start_at
    const startAt = event?.start_at as string | null
    if (startAt && new Date(startAt) <= cutoff) {
      return NextResponse.json(
        { error: 'Nie można anulować zgłoszenia – pozostało mniej niż 24 godziny do wydarzenia' },
        { status: 400 }
      )
    }
  }

  // ── Block duplicate pending request ───────────────────────────────────────
  const { data: existing } = await supabase
    .from('cancellation_requests')
    .select('id')
    .eq('registration_id', registrationId)
    .eq('status', 'pending')
    .maybeSingle()

  if (existing) {
    return NextResponse.json(
      { error: 'Masz już oczekujący wniosek o rezygnację dla tego zgłoszenia' },
      { status: 409 }
    )
  }

  // ── Create the request ────────────────────────────────────────────────────
  const { data: created, error } = await supabase
    .from('cancellation_requests')
    .insert({
      registration_id: registrationId,
      event_id: event?.id as string,
      cancelled_dates: cancelledDates,
      requested_by: user.id,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // ── Notify organizer ──────────────────────────────────────────────────────
  const createdBy = event?.created_by as string | null
  if (createdBy) {
    const adminClient = createServerClient()
    const { data: orgUser } = await adminClient.auth.admin.getUserById(createdBy)
    const organizerEmail = orgUser?.user?.email
    if (organizerEmail) {
      sendCancellationRequestEmailToOrganizer({
        to: organizerEmail,
        ownerName: participant?.owner_name ?? '',
        dogName: participant?.dog_name ?? '',
        eventTitle: String(event?.title ?? ''),
        eventDate: event?.start_at ? String(event.start_at) : null,
        eventLocation: event?.location ? String(event.location) : null,
        cancelledDates: cancelledDates,
      }).catch(() => {})
    }
  }

  return NextResponse.json(created, { status: 201 })
}
