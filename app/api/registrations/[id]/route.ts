import { NextResponse } from 'next/server'
import { createAuthClient, createServerClient } from '@/lib/supabaseServer'
import { getServerUser } from '@/lib/getServerUser'
import { sendRegistrationEmail, sendCancellationEmailToOrganizer, sendEventPaymentRequestEmail } from '@/lib/email'
import { getEventAccess } from '@/lib/eventAccess'
import { isOrganizerRole } from '@/lib/roles'
import { buildEventPriceItems } from '@/lib/eventPricing'
import { cancelPendingEventCheckouts, createEventCheckout } from '@/lib/eventCheckout'
import { createEventRefund } from '@/lib/eventRefund'
import { tryProcessEventWaitlist } from '@/lib/eventWaitlist'

interface Params {
  params: Promise<{ id: string }>
}

export async function PATCH(req: Request, { params }: Params) {
  const { id } = await params

  const { user, role } = await getServerUser()
  if (!user) return NextResponse.json({ error: 'Brak uprawnień' }, { status: 401 })
  let supabase = await createAuthClient()

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

  const participant = (reg as Record<string, unknown>).participants as Record<string, string | null> | null
  const event = (reg as Record<string, unknown>).events as Record<string, unknown> | null
  const participantEmail = participant?.owner_email ?? null
  const isOwner = (
    participant?.user_id === user.id
    || Boolean(participantEmail && participantEmail.toLowerCase() === user.email?.toLowerCase())
  )
  const requiresRegistrations = Object.keys(body).some(key => key !== 'checked_in')
  const isEventOwner = isOrganizerRole(role) && (role === 'admin' || event?.created_by === user.id)
  const eventAccess = isEventOwner ? null : await getEventAccess(String(reg.event_id))
  const isCollaborator = Boolean(eventAccess?.can(requiresRegistrations ? 'registrations' : 'checkin'))
  const isOrganizerOrAdmin = isEventOwner || isCollaborator
  if (isCollaborator) supabase = createServerClient()

  if (!isOrganizerOrAdmin && !isOwner) {
    return NextResponse.json({ error: 'Brak uprawnień' }, { status: 403 })
  }

  // Owners can only cancel their own registration
  if (isOwner && !isOrganizerOrAdmin && body.status !== 'cancelled') {
    return NextResponse.json({ error: 'Możesz tylko anulować własny zapis' }, { status: 403 })
  }

  if (isOwner && !isOrganizerOrAdmin && body.status === 'cancelled') {
    const startAt = event?.start_at as string | null
    const cutoff = new Date(Date.now() + 24 * 60 * 60 * 1000)
    if (startAt && new Date(startAt) <= cutoff) {
      return NextResponse.json(
        { error: 'Nie można anulować zgłoszenia - pozostało mniej niż 24 godziny do wydarzenia' },
        { status: 400 }
      )
    }
    return NextResponse.json(
      { error: 'Rezygnacja wymaga wysłania wniosku do organizatora' },
      { status: 409 }
    )
  }

  const allowedStatuses = ['pending', 'confirmed', 'cancelled']
  if (body.status && !allowedStatuses.includes(body.status as string)) {
    return NextResponse.json({ error: 'Nieprawidłowy status' }, { status: 400 })
  }

  const targetStatus = typeof body.status === 'string' ? body.status : null
  const targetIsActive = targetStatus === 'pending' || targetStatus === 'confirmed'

  if (isOrganizerOrAdmin && targetIsActive) {
    const participant = (reg as Record<string, unknown>).participants as Record<string, unknown> | null
    const activeStatuses = ['pending', 'confirmed']
    const matchingParticipantIds = new Set<string>()

    const dogId = typeof participant?.dog_id === 'string' ? participant.dog_id : null
    if (dogId) {
      const { data: dogParticipants, error: dogParticipantsError } = await supabase
        .from('participants')
        .select('id')
        .eq('dog_id', dogId)

      if (dogParticipantsError) {
        return NextResponse.json({ error: dogParticipantsError.message }, { status: 500 })
      }
      for (const p of dogParticipants ?? []) matchingParticipantIds.add(p.id)
    }

    const ownerEmail = typeof participant?.owner_email === 'string'
      ? participant.owner_email.trim().toLowerCase()
      : null
    const dogName = typeof participant?.dog_name === 'string'
      ? participant.dog_name.trim()
      : null

    if (ownerEmail && dogName) {
      const { data: namedParticipants, error: namedParticipantsError } = await supabase
        .from('participants')
        .select('id')
        .ilike('owner_email', ownerEmail)
        .ilike('dog_name', dogName)

      if (namedParticipantsError) {
        return NextResponse.json({ error: namedParticipantsError.message }, { status: 500 })
      }
      for (const p of namedParticipants ?? []) matchingParticipantIds.add(p.id)
    }

    if (matchingParticipantIds.size > 0) {
      const { data: duplicateRegs, error: duplicateRegsError } = await supabase
        .from('registrations')
        .select('id')
        .eq('event_id', reg.event_id)
        .in('participant_id', [...matchingParticipantIds])
        .in('status', activeStatuses)
        .neq('id', id)
        .limit(1)

      if (duplicateRegsError) {
        return NextResponse.json({ error: duplicateRegsError.message }, { status: 500 })
      }

      if ((duplicateRegs ?? []).length > 0) {
        return NextResponse.json(
          { error: 'Ten pies ma już aktywny zapis na to wydarzenie' },
          { status: 409 }
        )
      }
    }

    const maxParticipants = typeof event?.max_participants === 'number'
      ? event.max_participants
      : null
    if (maxParticipants !== null && maxParticipants > 0) {
      const { count, error: countError } = await supabase
        .from('registrations')
        .select('id', { count: 'exact', head: true })
        .eq('event_id', reg.event_id)
        .in('status', activeStatuses)
        .neq('id', id)

      if (countError) {
        return NextResponse.json({ error: countError.message }, { status: 500 })
      }

      if ((count ?? 0) >= maxParticipants) {
        return NextResponse.json(
          { error: 'Brak wolnych miejsc na to wydarzenie' },
          { status: 409 }
        )
      }
    }
  }

  if (isOrganizerOrAdmin && targetStatus === 'confirmed') {
    let priceItems
    try {
      priceItems = buildEventPriceItems(
        event as unknown as Parameters<typeof buildEventPriceItems>[0],
        (reg.form_data ?? {}) as Record<string, unknown>,
      )
    } catch (pricingError) {
      return NextResponse.json({ error: (pricingError as Error).message }, { status: 400 })
    }

    if (priceItems.length > 0) {
      const serviceClient = createServerClient()
      const { data: existingPayment } = await serviceClient
        .from('event_payments')
        .select('id, status')
        .eq('registration_id', id)
        .in('status', ['pending', 'completed'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (existingPayment?.status === 'pending') {
        return NextResponse.json({ error: 'Link do płatności został już wysłany' }, { status: 409 })
      }
      if (existingPayment?.status !== 'completed') {
        const checkout = await createEventCheckout({
          registration: {
            id: reg.id,
            participant_id: reg.participant_id,
            form_data: (reg.form_data ?? {}) as Record<string, unknown>,
          },
          event: event as unknown as Parameters<typeof createEventCheckout>[0]['event'],
          participant: {
            owner_email: participant?.owner_email ?? '',
            owner_name: participant?.owner_name,
            dog_name: participant?.dog_name,
            user_id: participant?.user_id,
          },
          pendingApproval: true,
        }, req.url)
        const appUrl = process.env.NEXT_PUBLIC_APP_URL
          ?? process.env.NEXT_PUBLIC_SITE_URL
          ?? new URL(req.url).origin
        await sendEventPaymentRequestEmail({
          to: participant?.owner_email ?? '',
          ownerName: participant?.owner_name ?? '',
          dogName: participant?.dog_name ?? '',
          eventTitle: String(event?.title ?? ''),
          amount: priceItems.reduce((sum, item) => sum + item.amount, 0),
          currency: priceItems[0].currency,
          checkoutUrl: new URL(`/pay/event/${checkout.checkoutToken}`, appUrl).toString(),
          expiresAt: new Date(Date.now() + 23 * 60 * 60 * 1000).toISOString(),
        })
        return NextResponse.json({ ...reg, payment_status: 'pending', payment_link_sent: true })
      }
    }
  }

  if (isOrganizerOrAdmin && targetStatus === 'cancelled') {
    const serviceClient = createServerClient()
    const { data: activePayment } = await serviceClient
      .from('event_payments')
      .select('id, status')
      .eq('registration_id', id)
      .in('status', ['pending', 'completed', 'partially_refunded'])
      .limit(1)
      .maybeSingle()
    if (activePayment?.status === 'completed' || activePayment?.status === 'partially_refunded') {
      const cancelledDates = Array.isArray(body.cancelledDates)
        ? body.cancelledDates.filter((date): date is string => typeof date === 'string')
        : null
      try {
        const refund = await createEventRefund({
          registrationId: id,
          cancelledDates,
          requestedBy: user.id,
        })
        const { data: refreshed } = await serviceClient.from('registrations')
          .select('*, participants(*), events(*)').eq('id', id).single()
        return NextResponse.json({
          ...(refreshed ?? reg),
          refund_id: refund.refundId,
          refund_status: refund.status,
          refunded_amount: refund.amount,
        }, { status: refund.status === 'succeeded' ? 200 : 202 })
      } catch (refundError) {
        console.error('[event-refund] Failed to create refund:', refundError)
        return NextResponse.json(
          { error: refundError instanceof Error ? refundError.message : 'Nie udało się zlecić zwrotu' },
          { status: 409 },
        )
      }
    }
    if (activePayment?.status === 'pending') {
      if (Array.isArray(body.cancelledDates)) return NextResponse.json(
        { error: 'Nie można częściowo zmienić zapisu z oczekującą płatnością. Anuluj cały zapis i utwórz nowy.' },
        { status: 409 },
      )
      try {
        await cancelPendingEventCheckouts([id])
      } catch (paymentError) {
        console.error('[event-payment] Failed to cancel pending Checkout:', paymentError)
        return NextResponse.json(
          { error: 'Nie udało się bezpiecznie anulować oczekującej płatności' },
          { status: 409 },
        )
      }
    }
  }

  // Organizer partial date cancellation: cancelledDates = string[] → remove dates, null → cancel all
  if (body.status === 'cancelled' && isOrganizerOrAdmin && 'cancelledDates' in body) {
    const cancelledDates = body.cancelledDates as string[] | null
    if (cancelledDates !== null && Array.isArray(cancelledDates) && cancelledDates.length > 0) {
      const event = (reg as Record<string, unknown>).events as Record<string, unknown> | null
      const eventFormFields: Array<{ id: string; type: string }> =
        Array.isArray(event?.form_fields) ? (event!.form_fields as Array<{ id: string; type: string }>) : []
      const multidateFieldIds = eventFormFields.filter(f => f.type === 'multidate').map(f => f.id)
      const formData: Record<string, unknown> = (reg.form_data ?? {}) as Record<string, unknown>
      const updatedFormData: Record<string, unknown> = { ...formData }

      for (const fieldId of multidateFieldIds) {
        const existing = Array.isArray(formData[fieldId]) ? (formData[fieldId] as string[]) : []
        updatedFormData[fieldId] = existing.filter(d => !cancelledDates.includes(d))
      }

      const allGone =
        multidateFieldIds.length > 0 &&
        multidateFieldIds.every(fieldId => {
          const remaining = updatedFormData[fieldId]
          return Array.isArray(remaining) && remaining.length === 0
        })

      const regUpdatePartial: Record<string, unknown> = { form_data: updatedFormData }
      if (allGone) regUpdatePartial.status = 'cancelled'

      const { data: dataPartial, error: errPartial } = await supabase
        .from('registrations')
        .update(regUpdatePartial)
        .eq('id', id)
        .select('*, participants(*), events(*)')
        .single()

      if (errPartial) return NextResponse.json({ error: errPartial.message }, { status: 500 })

      // Remove schedule_assignments for the cancelled dates
      const eventId = event?.id as string | undefined
      if (eventId) {
        const serviceClient = createServerClient()
        const { data: cancelledSlots } = await serviceClient
          .from('time_slots')
          .select('id')
          .eq('event_id', eventId)
          .in('slot_date', cancelledDates)

        if (cancelledSlots?.length) {
          await serviceClient
            .from('schedule_assignments')
            .delete()
            .eq('registration_id', id)
            .in('time_slot_id', cancelledSlots.map(s => s.id))
        }
      }

      return NextResponse.json(dataPartial)
    }
  }

  const update: Record<string, unknown> = {}
  const registrationEvent = (reg as Record<string, unknown>).events as Record<string, unknown> | null
  if ('status' in body) update.status = body.status
  // Organizer/admin can also update time_slot_id for schedule management
  if ('time_slot_id' in body && isOrganizerOrAdmin) {
    update.time_slot_id = body.time_slot_id
  }
  // Organizer/admin can toggle check-in
  if ('checked_in' in body && isOrganizerOrAdmin) {
    if (registrationEvent?.status === 'finished' || registrationEvent?.status === 'cancelled') {
      return NextResponse.json(
        { error: 'Zawody są zakończone. Odprawa jest zablokowana.' },
        { status: 409 },
      )
    }
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

  if (update.status === 'cancelled' && isOrganizerOrAdmin) {
    const serviceClient = createServerClient()
    await serviceClient
      .from('schedule_assignments')
      .delete()
      .eq('registration_id', id)
    await tryProcessEventWaitlist(reg.event_id)
  }

  // Send email when organizer confirms a registration
  if (update.status === 'confirmed' && isOrganizerOrAdmin) {
    const participant = (data as Record<string, unknown>).participants as Record<string, string> | null
    const event = (data as Record<string, unknown>).events as Record<string, string> | null
    if (participant?.owner_email) {
      await sendRegistrationEmail({
        to: participant.owner_email,
        ownerName: participant.owner_name ?? '',
        dogName: participant.dog_name ?? '',
        eventTitle: event?.title ?? '',
        eventDate: event?.start_at ?? null,
        eventLocation: event?.location ?? null,
        status: 'confirmed',
      })
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
        await sendCancellationEmailToOrganizer({
          to: organizerEmail,
          ownerName: participant?.owner_name ?? '',
          dogName: participant?.dog_name ?? '',
          eventTitle: String(event?.title ?? ''),
          eventDate: event?.start_at ? String(event.start_at) : null,
          eventLocation: event?.location ? String(event.location) : null,
          previousStatus: reg.status,
        })
      }
    }
  }

  return NextResponse.json(data)
}
