import { NextResponse } from 'next/server'
import { createAuthClient } from '@/lib/supabaseServer'
import { checkRoleForApi } from '@/lib/getServerUser'
import { sendEventChangeEmail } from '@/lib/email'
import {
  buildEventDateReplacements,
  syncMultidateFormData,
  syncMultidateFormFields,
} from '@/lib/eventDateSync'

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
    .select('created_by, start_at, end_at, location, title, status, results_public, form_fields')
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
    'has_results', 'results_public', 'has_schedule', 'auto_confirm', 'max_participants', 'entry_fee', 'organizer_name', 'slug',
    'lat', 'lng', 'gallery_images', 'grouping_field', 'current_start_index', 'track_distance_m',
    'live_phase', 'form_template_id',
  ]
  const update: Record<string, unknown> = {}
  for (const field of allowedFields) {
    if (field in body) update[field] = body[field]
  }

  const dateReplacements = buildEventDateReplacements(existingEvent, {
    start_at: 'start_at' in body ? body.start_at as string | null : existingEvent.start_at,
    end_at: 'end_at' in body ? body.end_at as string | null : existingEvent.end_at,
  })

  if (dateReplacements.length > 0) {
    const sourceFields = 'form_fields' in update ? update.form_fields : existingEvent.form_fields
    update.form_fields = syncMultidateFormFields(sourceFields, dateReplacements)
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

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (dateReplacements.length > 0) {
    await syncDependentEventDates(supabase, id, data.form_fields, dateReplacements)
  }

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

      for (const reg of registrations) {
        const p = (reg as Record<string, unknown>).participants as Record<string, string> | null
        if (!p?.owner_email) continue
        sendEventChangeEmail({
          to: p.owner_email,
          ownerName: p.owner_name ?? '',
          dogName: p.dog_name ?? '',
          eventTitle,
          changedFields,
          newStartAt,
          newLocation,
        }).catch(() => {})
      }
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
