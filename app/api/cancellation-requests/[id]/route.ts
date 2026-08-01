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
  const serviceClient = createServerClient()

  // Fetch through the authenticated client first so RLS limits the request to
  // the organizer. Related records are loaded separately to avoid ambiguous
  // object/array relation shapes from nested PostgREST responses.
  const { data: request } = await supabase
    .from('cancellation_requests')
    .select('*')
    .eq('id', id)
    .single()

  if (!request) return NextResponse.json({ error: 'Nie znaleziono wniosku' }, { status: 404 })
  if (request.status !== 'pending') {
    return NextResponse.json({ error: 'Wniosek nie jest już oczekujący' }, { status: 409 })
  }

  const { data: reg } = await serviceClient
    .from('registrations')
    .select('*')
    .eq('id', request.registration_id)
    .maybeSingle()
  if (!reg) return NextResponse.json({ error: 'Nie znaleziono zgłoszenia' }, { status: 404 })

  const [{ data: participant }, { data: event }] = await Promise.all([
    serviceClient.from('participants').select('*').eq('id', reg.participant_id).maybeSingle(),
    serviceClient.from('events').select('*').eq('id', reg.event_id).maybeSingle(),
  ])
  if (!event) return NextResponse.json({ error: 'Nie znaleziono wydarzenia' }, { status: 404 })
  if (role !== 'admin' && event.created_by !== user.id) {
    return NextResponse.json({ error: 'Brak uprawnień' }, { status: 403 })
  }

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
        eventTitle: String(event.title ?? ''),
        eventDate: request.cancelled_dates ? null : event.start_at ? String(event.start_at) : null,
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
      Array.isArray(event.form_fields) ? (event.form_fields as Array<{ id: string; type: string }>) : []

    const multidateFieldIds = eventFormFields
      .filter(f => f.type === 'multidate')
      .map(f => f.id)

    if (multidateFieldIds.length === 0) {
      return NextResponse.json({ error: 'To wydarzenie nie obsługuje rezygnacji z wybranych dat' }, { status: 409 })
    }

    const selectedDatesBeforeCancellation = multidateFieldIds.flatMap(fieldId =>
      Array.isArray(formData[fieldId]) ? formData[fieldId] as string[] : []
    )
    const unknownCancelledDate = selectedDatesBeforeCancellation.length > 0
      && cancelledDates.some(date => !selectedDatesBeforeCancellation.includes(date))
    if (unknownCancelledDate) {
      return NextResponse.json({ error: 'Wniosek zawiera termin, którego nie ma w zgłoszeniu' }, { status: 409 })
    }

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

  if (Object.keys(regUpdate).length > 0) {
    const { data: updatedRegistration, error: regError } = await serviceClient
      .from('registrations')
      .update(regUpdate)
      .eq('id', reg.id)
      .select('id, status, form_data')
      .single()

    if (regError) return NextResponse.json({ error: regError.message }, { status: 500 })
    if (newRegistrationStatus === 'cancelled' && updatedRegistration?.status !== 'cancelled') {
      return NextResponse.json({ error: 'Nie udało się anulować zgłoszenia' }, { status: 500 })
    }
  }

  // Remove every assignment when the last selected date was cancelled. For a
  // partial cancellation, clean both modern item_date assignments and legacy
  // rows whose date exists only through the linked time slot.
  if (newRegistrationStatus === 'cancelled') {
    const { error: assignmentError } = await serviceClient
      .from('schedule_assignments')
      .delete()
      .eq('registration_id', reg.id)
    if (assignmentError) {
      return NextResponse.json({ error: 'Nie udało się usunąć zgłoszenia z grafiku' }, { status: 500 })
    }
  } else if (cancelledDates !== null && cancelledDates.length > 0) {
    const { error: datedAssignmentError } = await serviceClient
      .from('schedule_assignments')
      .delete()
      .eq('registration_id', reg.id)
      .in('item_date', cancelledDates)
    if (datedAssignmentError) {
      return NextResponse.json({ error: 'Nie udało się zaktualizować grafiku' }, { status: 500 })
    }

    const { data: cancelledSlots, error: slotError } = await serviceClient
      .from('time_slots')
      .select('id')
      .eq('event_id', event.id)
      .in('slot_date', cancelledDates)
    if (slotError) {
      return NextResponse.json({ error: 'Nie udało się sprawdzić grafiku' }, { status: 500 })
    }
    if (cancelledSlots?.length) {
      const { error: legacyAssignmentError } = await serviceClient
        .from('schedule_assignments')
        .delete()
        .eq('registration_id', reg.id)
        .in('time_slot_id', cancelledSlots.map(slot => slot.id))
      if (legacyAssignmentError) {
        return NextResponse.json({ error: 'Nie udało się zaktualizować grafiku' }, { status: 500 })
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
      eventTitle: String(event.title ?? ''),
      eventDate: cancelledDates ? null : event.start_at ? String(event.start_at) : null,
      cancelledDates,
      accepted: true,
    })
  }

  return NextResponse.json({ ok: true, action: 'accepted', registrationCancelled: newRegistrationStatus === 'cancelled' })
}
