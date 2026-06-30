import { NextResponse } from 'next/server'
import { createAuthClient, createServerClient } from '@/lib/supabaseServer'
import { getServerUser } from '@/lib/getServerUser'
import { sendCancellationResultEmail } from '@/lib/email'

interface Params {
  params: Promise<{ id: string }>
}

/**
 * PATCH /api/cancellation-requests/[id]
 *
 * Body: { action: 'accept' | 'reject' }
 *
 * accept:
 *   - cancelled_dates = null  → set registration.status = 'cancelled'
 *   - cancelled_dates = [...]  → remove those dates from form_data multidate fields;
 *                                if no dates remain → set status = 'cancelled'
 * reject:
 *   - set request.status = 'rejected', registration stays unchanged
 *
 * Both actions send an email to the participant.
 */
export async function PATCH(req: Request, { params }: Params) {
  const { id } = await params

  const { user, role } = await getServerUser()
  if (!user || (role !== 'organizer' && role !== 'admin')) {
    return NextResponse.json({ error: 'Brak uprawnień' }, { status: 403 })
  }

  let body: { action: 'accept' | 'reject' }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Nieprawidłowe JSON' }, { status: 400 })
  }

  if (body.action !== 'accept' && body.action !== 'reject') {
    return NextResponse.json({ error: 'Nieprawidłowa akcja' }, { status: 400 })
  }

  const supabase = await createAuthClient()

  // Fetch the request + related data
  const { data: request } = await supabase
    .from('cancellation_requests')
    .select('*, registrations(*, participants(*), events(*))')
    .eq('id', id)
    .single()

  if (!request) return NextResponse.json({ error: 'Nie znaleziono wniosku' }, { status: 404 })
  if (request.status !== 'pending') {
    return NextResponse.json({ error: 'Wniosek nie jest już oczekujący' }, { status: 409 })
  }

  const reg = (request as Record<string, unknown>).registrations as Record<string, unknown> | null
  const participant = reg?.participants as Record<string, string> | null
  const event = reg?.events as Record<string, unknown> | null

  if (!reg) return NextResponse.json({ error: 'Nie znaleziono zgłoszenia' }, { status: 404 })

  const now = new Date().toISOString()

  if (body.action === 'reject') {
    const { error } = await supabase
      .from('cancellation_requests')
      .update({ status: 'rejected', processed_at: now, processed_by: user.id })
      .eq('id', id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Email participant
    if (participant?.owner_email) {
      await sendCancellationResultEmail({
        to: participant.owner_email,
        ownerName: participant.owner_name ?? '',
        dogName: participant.dog_name ?? '',
        eventTitle: String(event?.title ?? ''),
        eventDate: event?.start_at ? String(event.start_at) : null,
        cancelledDates: request.cancelled_dates ?? null,
        accepted: false,
      })
    }

    return NextResponse.json({ ok: true, action: 'rejected' })
  }

  // ── ACCEPT ──────────────────────────────────────────────────────────────
  const cancelledDates: string[] | null = request.cancelled_dates ?? null

  let newRegistrationStatus: string | null = null
  let newFormData: Record<string, unknown> | null = null

  if (cancelledDates === null) {
    // Cancel entire registration
    newRegistrationStatus = 'cancelled'
  } else {
    // Remove specific dates from multidate form fields
    const formData: Record<string, unknown> = (reg.form_data as Record<string, unknown>) ?? {}
    const eventFormFields: Array<{ id: string; type: string }> =
      Array.isArray(event?.form_fields) ? (event.form_fields as Array<{ id: string; type: string }>) : []

    const multidateFieldIds = eventFormFields
      .filter(f => f.type === 'multidate')
      .map(f => f.id)

    const updated: Record<string, unknown> = { ...formData }

    for (const fieldId of multidateFieldIds) {
      const existing = Array.isArray(formData[fieldId]) ? (formData[fieldId] as string[]) : []
      updated[fieldId] = existing.filter(d => !cancelledDates.includes(d))
    }

    newFormData = updated

    // If all dates in every multidate field are gone → cancel entire registration
    const allDatesGone =
      multidateFieldIds.length > 0 &&
      multidateFieldIds.every(fieldId => {
        const remaining = updated[fieldId]
        return Array.isArray(remaining) && remaining.length === 0
      })

    if (allDatesGone) {
      newRegistrationStatus = 'cancelled'
    }
  }

  // Update registration
  const regUpdate: Record<string, unknown> = {}
  if (newRegistrationStatus) regUpdate.status = newRegistrationStatus
  if (newFormData) regUpdate.form_data = newFormData

  const serviceClient = createServerClient()

  if (Object.keys(regUpdate).length > 0) {
    const { error: regError } = await serviceClient
      .from('registrations')
      .update(regUpdate)
      .eq('id', reg.id as string)

    if (regError) return NextResponse.json({ error: regError.message }, { status: 500 })
  }

  // If specific dates were cancelled, remove any schedule_assignments for those dates
  if (cancelledDates !== null && cancelledDates.length > 0) {
    const eventId = (event as Record<string, unknown> | null)?.id as string | undefined
    if (eventId) {
      const { data: cancelledSlots } = await serviceClient
        .from('time_slots')
        .select('id')
        .eq('event_id', eventId)
        .in('slot_date', cancelledDates)

      if (cancelledSlots?.length) {
        await serviceClient
          .from('schedule_assignments')
          .delete()
          .eq('registration_id', reg.id as string)
          .in('time_slot_id', cancelledSlots.map(s => s.id))
      }
    }
  }

  // Mark request accepted
  const { error: reqError } = await supabase
    .from('cancellation_requests')
    .update({ status: 'accepted', processed_at: now, processed_by: user.id })
    .eq('id', id)

  if (reqError) return NextResponse.json({ error: reqError.message }, { status: 500 })

  // Email participant
  if (participant?.owner_email) {
    await sendCancellationResultEmail({
      to: participant.owner_email,
      ownerName: participant.owner_name ?? '',
      dogName: participant.dog_name ?? '',
      eventTitle: String(event?.title ?? ''),
      eventDate: event?.start_at ? String(event.start_at) : null,
      cancelledDates: cancelledDates,
      accepted: true,
    })
  }

  return NextResponse.json({ ok: true, action: 'accepted', registrationCancelled: newRegistrationStatus === 'cancelled' })
}
