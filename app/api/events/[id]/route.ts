import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createAuthClient } from '@/lib/supabaseServer'
import { checkRoleForApi } from '@/lib/getServerUser'
import { sendEventChangeEmail } from '@/lib/email'
import {
  buildEventDateReplacements,
  syncMultidateFormData,
  syncMultidateFormFields,
} from '@/lib/eventDateSync'
import {
  isValidTrackDistanceM,
  parseTrackDistanceM,
  TRACK_DISTANCE_MAX_M,
  TRACK_DISTANCE_MIN_M,
} from '@/lib/speedway'
import {
  validateCompetitionFieldValues,
  validateCompetitionFormatDefinition,
} from '@/lib/competitionEngine'
import { validateFormFieldDefinitions } from '@/lib/registrationFormValidation'
import { validateEventCompetitionDependencies } from '@/lib/eventCompetitionDependencies'
import { normalizeEventDatePrices, validateEventPricing } from '@/lib/eventPricing'
import { cancelPendingEventCheckouts } from '@/lib/eventCheckout'
import { createEventRefund } from '@/lib/eventRefund'

interface Params {
  params: Promise<{ id: string }>
}

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params
  const supabase = await createAuthClient()
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !data) return NextResponse.json({ error: 'Nie znaleziono' }, { status: 404 })
  return NextResponse.json(data)
}

export async function PATCH(req: Request, { params }: Params) {
  const { id } = await params

  // Require organizer or admin role
  const authResult = await checkRoleForApi(['organizer', 'admin'])
  if ('error' in authResult) return authResult.error

  const supabase = await createAuthClient()

  // Fetch existing event (for ownership check + change detection)
  const { data: existingEvent } = await supabase
    .from('events')
    .select('created_by, start_at, end_at, location, title, status, results_public, form_fields, entry_fee, pricing_mode, date_prices, currency, track_distance_m, slug, competition_format_id, competition_config, competition_values, competition_config_revision, competition_config_locked_at')
    .eq('id', id)
    .single()

  if (!existingEvent) return NextResponse.json({ error: 'Nie znaleziono' }, { status: 404 })

  // Only the event creator or admin can edit
  if (authResult.role !== 'admin' && existingEvent.created_by !== authResult.user.id) {
    return NextResponse.json({ error: 'Nie masz uprawnień do edycji tego wydarzenia' }, { status: 403 })
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Nieprawidłowe JSON' }, { status: 400 })
  }

  // Only allow updating safe fields (including new phase-1 columns)
  const allowedFields = [
    'title', 'description', 'location', 'start_at', 'end_at', 'status',
    'image_url', 'metadata', 'event_type_id', 'form_fields', 'registration_deadline',
    'has_results', 'results_public', 'has_schedule', 'auto_confirm', 'max_participants', 'entry_fee', 'pricing_mode', 'date_prices', 'currency', 'organizer_name', 'slug',
    'lat', 'lng', 'gallery_images', 'grouping_field', 'current_start_index', 'track_distance_m',
    'live_phase', 'form_template_id', 'competition_values',
  ]
  const update: Record<string, unknown> = {}
  for (const field of allowedFields) {
    if (field in body) update[field] = body[field]
  }

  if ('pricing_mode' in update && !['free', 'flat', 'per_date'].includes(String(update.pricing_mode))) {
    return NextResponse.json({ error: 'Nieprawidłowy sposób naliczania opłat' }, { status: 400 })
  }
  if ('currency' in update && String(update.currency).toUpperCase() !== 'PLN') {
    return NextResponse.json({ error: 'Obecnie płatności za wydarzenia obsługują wyłącznie PLN' }, { status: 400 })
  }

  let nextCompetitionConfig = existingEvent.competition_config
  let nextCompetitionFormatId = existingEvent.competition_format_id
  const nextEventStatus = typeof body.status === 'string' ? body.status : existingEvent.status

  if ('competition_format_id' in body) {
    if (body.competition_format_id === null || body.competition_format_id === '') {
      nextCompetitionFormatId = null
      nextCompetitionConfig = 'competition_config' in body ? body.competition_config : null
      if (nextCompetitionConfig === null) update.competition_values = {}
    } else if (typeof body.competition_format_id === 'string') {
      const { data: format, error: formatError } = await supabase
        .from('competition_formats')
        .select('id, status, definition, created_by')
        .eq('id', body.competition_format_id)
        .maybeSingle()
      if (formatError) return NextResponse.json({ error: formatError.message }, { status: 500 })
      if (!format) {
        return NextResponse.json({ error: 'Nie znaleziono wybranego formatu zawodów.' }, { status: 404 })
      }
      if (format.status === 'archived') {
        return NextResponse.json(
          { error: 'Archiwalnego formatu nie można przypisać do wydarzenia.' },
          { status: 409 },
        )
      }
      if (nextEventStatus !== 'draft' && format.status !== 'published') {
        return NextResponse.json(
          { error: 'Przed publikacją wydarzenia opublikuj jego format zawodów.' },
          { status: 409 },
        )
      }
      if (
        format.status === 'draft'
        && authResult.role !== 'admin'
        && format.created_by !== authResult.user.id
      ) {
        return NextResponse.json({ error: 'Brak dostępu do roboczego formatu zawodów.' }, { status: 403 })
      }
      nextCompetitionFormatId = format.id
      nextCompetitionConfig = format.definition
    } else {
      return NextResponse.json({ error: 'Nieprawidłowe competition_format_id.' }, { status: 400 })
    }
  } else if ('competition_config' in body && nextCompetitionFormatId === null) {
    nextCompetitionConfig = body.competition_config
  }

  if (nextCompetitionConfig !== null) {
    const validation = validateCompetitionFormatDefinition(nextCompetitionConfig)
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Konfiguracja zawodów jest nieprawidłowa.', issues: validation.issues },
        { status: 400 },
      )
    }
    nextCompetitionConfig = validation.data
    const nextValues = 'competition_values' in update
      ? update.competition_values
      : existingEvent.competition_values
    const valueIssues = validateCompetitionFieldValues(
      validation.data.eventFields,
      nextValues,
      { requireRequired: nextEventStatus !== 'draft' },
    )
    if (valueIssues.length > 0) {
      return NextResponse.json(
        { error: 'Parametry formatu zawodów są nieprawidłowe.', issues: valueIssues },
        { status: 400 },
      )
    }
  } else if ('competition_values' in update && Object.keys(
    typeof update.competition_values === 'object'
      && update.competition_values !== null
      && !Array.isArray(update.competition_values)
      ? update.competition_values as Record<string, unknown>
      : {}
  ).length > 0) {
    return NextResponse.json(
      { error: 'Nie można zapisać parametrów bez formatu zawodów.' },
      { status: 400 },
    )
  }

  if (
    nextCompetitionConfig !== existingEvent.competition_config
    || nextCompetitionFormatId !== existingEvent.competition_format_id
    || 'competition_values' in update
  ) {
    update.competition_format_id = nextCompetitionFormatId
    update.competition_config = nextCompetitionConfig
    update.competition_config_revision = (
      Number(existingEvent.competition_config_revision) || 1
    ) + 1
  }

  if ('track_distance_m' in update) {
    const nextDistance = parseTrackDistanceM(update.track_distance_m)
    if (!isValidTrackDistanceM(nextDistance)) {
      return NextResponse.json(
        { error: `Długość toru musi być liczbą od ${TRACK_DISTANCE_MIN_M} do ${TRACK_DISTANCE_MAX_M} m.` },
        { status: 400 },
      )
    }

    const currentDistance = parseTrackDistanceM(existingEvent.track_distance_m)
    if (isValidTrackDistanceM(currentDistance) && nextDistance !== currentDistance) {
      return NextResponse.json(
        { error: 'Długość toru została już zapisana i nie może być edytowana.' },
        { status: 409 },
      )
    }
    if (isValidTrackDistanceM(currentDistance) && nextDistance === currentDistance) {
      delete update.track_distance_m
    } else {
      update.track_distance_m = nextDistance
    }
  }

  const dateReplacements = buildEventDateReplacements(existingEvent, {
    start_at: 'start_at' in body ? body.start_at as string | null : existingEvent.start_at,
    end_at: 'end_at' in body ? body.end_at as string | null : existingEvent.end_at,
  })

  if (dateReplacements.length > 0) {
    const sourceFields = 'form_fields' in update ? update.form_fields : existingEvent.form_fields
    update.form_fields = syncMultidateFormFields(sourceFields, dateReplacements)
  }

  if (nextEventStatus !== 'draft') {
    const nextFormFields = 'form_fields' in update
      ? update.form_fields
      : existingEvent.form_fields
    const fieldIssues = validateFormFieldDefinitions(nextFormFields)
    if (fieldIssues.length > 0) {
      return NextResponse.json(
        { error: fieldIssues[0].message, issues: fieldIssues },
        { status: 400 },
      )
    }
    const dependencyIssues = validateEventCompetitionDependencies(
      nextFormFields,
      nextCompetitionConfig as import('@/types/competition').CompetitionFormatDefinition | null,
    )
    if (dependencyIssues.length > 0) {
      return NextResponse.json(
        { error: dependencyIssues[0].message, issues: dependencyIssues },
        { status: 400 },
      )
    }
    const nextPricingMode = ('pricing_mode' in update ? update.pricing_mode : existingEvent.pricing_mode) as 'free' | 'flat' | 'per_date'
    const pricingError = validateEventPricing({
      title: ('title' in update ? update.title : existingEvent.title) as string,
      pricing_mode: nextPricingMode,
      entry_fee: ('entry_fee' in update ? update.entry_fee : existingEvent.entry_fee) as number | null,
      date_prices: 'date_prices' in update ? update.date_prices : existingEvent.date_prices,
      currency: ('currency' in update ? update.currency : existingEvent.currency) as string,
      form_fields: nextFormFields,
    })
    if (pricingError) return NextResponse.json({ error: pricingError }, { status: 400 })
    if (nextPricingMode === 'flat' || nextPricingMode === 'per_date') {
      const { data: payoutProfile } = await supabase
        .from('profiles')
        .select('stripe_account_id, stripe_onboarded')
        .eq('id', existingEvent.created_by)
        .maybeSingle()
      if (!payoutProfile?.stripe_onboarded || !payoutProfile.stripe_account_id) {
        return NextResponse.json(
          { error: 'Połącz konto Stripe przed zapisaniem płatnego wydarzenia' },
          { status: 409 },
        )
      }
    }
  }

  if ('date_prices' in update) update.date_prices = normalizeEventDatePrices(update.date_prices)
  if ('currency' in update && typeof update.currency === 'string') {
    update.currency = update.currency.toUpperCase()
  }

  if (update.status === 'cancelled') {
    const { data: eventRegistrations } = await supabase
      .from('registrations')
      .select('id')
      .eq('event_id', id)
    const registrationIds = (eventRegistrations ?? []).map(registration => registration.id)
    if (registrationIds.length > 0) {
      const { data: activePayments } = await supabase
        .from('event_payments')
        .select('id, status, registration_id')
        .in('registration_id', registrationIds)
        .in('status', ['pending', 'completed', 'partially_refunded'])
      if ((activePayments ?? []).some(payment => payment.status === 'pending')) {
        try {
          await cancelPendingEventCheckouts(registrationIds)
        } catch (paymentError) {
          console.error('[event-payment] Failed to cancel event Checkouts:', paymentError)
          return NextResponse.json(
            { error: 'Nie udało się bezpiecznie anulować oczekujących płatności wydarzenia' },
            { status: 409 },
          )
        }
      }
      const paidPayments = (activePayments ?? []).filter(payment => payment.status !== 'pending')
      for (const payment of paidPayments) {
        try {
          await createEventRefund({
            registrationId: payment.registration_id,
            cancelledDates: null,
            requestedBy: authResult.user.id,
          })
        } catch (refundError) {
          console.error('[event-refund] Event cancellation refund failed:', refundError)
          return NextResponse.json(
            { error: refundError instanceof Error ? refundError.message : 'Nie udało się zwrócić wszystkich płatności wydarzenia' },
            { status: 409 },
          )
        }
      }
    }
  }

  // Detect significant changes (date or location)
  const SIGNIFICANT_FIELDS = ['start_at', 'end_at', 'location'] as const
  const changedFields: string[] = []
  for (const field of SIGNIFICANT_FIELDS) {
    if (field in body && body[field] !== existingEvent[field as keyof typeof existingEvent]) {
      changedFields.push(field)
    }
  }
  if ('title' in body && body.title !== existingEvent.title) changedFields.push('title')

  if (changedFields.length > 0) {
    update.last_significant_change = new Date().toISOString()
    update.changed_fields = changedFields
  }

  const { data, error } = await supabase
    .from('events')
    .update(update)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    const locked = error.message.includes('Competition configuration is locked')
    return NextResponse.json(
      { error: locked ? 'Konfiguracja zawodów jest zablokowana po zapisaniu pierwszego wyniku.' : error.message },
      { status: locked ? 409 : 500 },
    )
  }

  if (dateReplacements.length > 0) {
    await syncDependentEventDates(supabase, id, data.form_fields, dateReplacements)
  }

  const pathsToRevalidate = new Set([
    '/',
    '/organizer',
    `/events/${existingEvent.slug}`,
    `/live/${existingEvent.slug}`,
    `/archive/${existingEvent.slug}`,
  ])
  if (typeof data.slug === 'string' && data.slug) {
    pathsToRevalidate.add(`/events/${data.slug}`)
    pathsToRevalidate.add(`/live/${data.slug}`)
    pathsToRevalidate.add(`/archive/${data.slug}`)
  }
  for (const path of pathsToRevalidate) revalidatePath(path)

  // Send email notifications if date or location changed
  const significantChange = changedFields.some(f => ['start_at', 'end_at', 'location'].includes(f))
  if (significantChange && existingEvent.status !== 'cancelled') {
    // Fetch all confirmed registrations with participant emails
    const { data: registrations } = await supabase
      .from('registrations')
      .select('id, participants(owner_email, owner_name, dog_name)')
      .eq('event_id', id)
      .eq('status', 'confirmed')

    if (registrations?.length) {
      const eventTitle = (body.title ?? existingEvent.title) as string
      const newStartAt = (body.start_at as string | null) ?? null
      const newLocation = (body.location as string | null) ?? null

      await Promise.all(registrations.map(reg => {
        const p = (reg as Record<string, unknown>).participants as Record<string, string> | null
        if (!p?.owner_email) return Promise.resolve()
        return sendEventChangeEmail({
          to: p.owner_email,
          ownerName: p.owner_name ?? '',
          dogName: p.dog_name ?? '',
          eventTitle,
          changedFields,
          newStartAt,
          newLocation,
        })
      }))
    }
  }

  return NextResponse.json(data)
}

async function syncDependentEventDates(
  supabase: Awaited<ReturnType<typeof createAuthClient>>,
  eventId: string,
  formFields: unknown,
  dateReplacements: Array<{ from: string; to: string }>,
) {
  const multidateFieldIds = Array.isArray(formFields)
    ? formFields
        .filter((field: unknown): field is { id: string; type: string } =>
          !!field &&
          typeof field === 'object' &&
          (field as { type?: unknown }).type === 'multidate' &&
          typeof (field as { id?: unknown }).id === 'string'
        )
        .map(field => field.id)
    : []

  const { data: registrations } = multidateFieldIds.length > 0
    ? await supabase
        .from('registrations')
        .select('id, form_data')
        .eq('event_id', eventId)
    : { data: [] }

  for (const registration of registrations ?? []) {
    const { data: syncedFormData, changed } = syncMultidateFormData(
      (registration as { form_data?: Record<string, unknown> | null }).form_data,
      multidateFieldIds,
      dateReplacements,
    )

    if (!changed) continue

    await supabase
      .from('registrations')
      .update({ form_data: syncedFormData })
      .eq('id', (registration as { id: string }).id)
  }

  for (const replacement of dateReplacements) {
    await supabase
      .from('time_slots')
      .update({ slot_date: replacement.to })
      .eq('event_id', eventId)
      .eq('slot_date', replacement.from)
  }

  const { data: eventRegistrations } = await supabase
    .from('registrations')
    .select('id')
    .eq('event_id', eventId)

  const registrationIds = (eventRegistrations ?? []).map((registration: { id: string }) => registration.id)
  if (registrationIds.length === 0) return

  for (const replacement of dateReplacements) {
    await supabase
      .from('schedule_assignments')
      .update({ item_date: replacement.to })
      .in('registration_id', registrationIds)
      .eq('item_date', replacement.from)
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  const { id } = await params

  const authResult = await checkRoleForApi(['organizer', 'admin'])
  if ('error' in authResult) return authResult.error

  const supabase = await createAuthClient()

  const { data: existing } = await supabase
    .from('events')
    .select('created_by')
    .eq('id', id)
    .single()

  if (!existing) return NextResponse.json({ error: 'Nie znaleziono' }, { status: 404 })

  if (authResult.role !== 'admin' && existing.created_by !== authResult.user.id) {
    return NextResponse.json({ error: 'Nie masz uprawnień do usunięcia tego wydarzenia' }, { status: 403 })
  }

  const { error } = await supabase.from('events').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
