import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabaseServer'
import { checkRoleForApi } from '@/lib/getServerUser'

interface Params {
  params: Promise<{ id: string }>
}

/** GET /api/events/[id]/schedule-assignments
 *  Returns all schedule_assignments whose registration belongs to this event.
 */
export async function GET(_req: Request, { params }: Params) {
  const { id } = await params

  const authResult = await checkRoleForApi(['organizer', 'admin'])
  if ('error' in authResult) return authResult.error

  const supabase = createServerClient()

  const { data: event } = await supabase
    .from('events')
    .select('created_by, form_fields')
    .eq('id', id)
    .single()

  if (!event) return NextResponse.json({ error: 'Nie znaleziono eventu' }, { status: 404 })
  if (authResult.role !== 'admin' && event.created_by !== authResult.user.id) {
    return NextResponse.json({ error: 'Brak uprawnień' }, { status: 403 })
  }

  const multiDateFieldIds: string[] = Array.isArray((event as Record<string, unknown> | null)?.form_fields)
    ? ((event as Record<string, unknown>).form_fields as Array<{ id: string; type: string }>)
        .filter(field => field.type === 'multidate')
        .map(field => field.id)
    : []

  // Get registration IDs for this event
  const { data: regs } = await supabase
    .from('registrations')
    .select('id, form_data')
    .eq('event_id', id)
    .eq('status', 'confirmed')

  const regIds = (regs ?? []).map((r: { id: string }) => r.id)
  if (regIds.length === 0) return NextResponse.json([])

  const regDatesById = new Map(
    (regs ?? []).map((reg: { id: string; form_data?: Record<string, unknown> }) => {
      const selectedDates = multiDateFieldIds.flatMap(fieldId =>
        Array.isArray(reg.form_data?.[fieldId]) ? (reg.form_data?.[fieldId] as string[]) : []
      )
      return [reg.id, new Set(selectedDates)]
    })
  )

  const { data, error } = await supabase
    .from('schedule_assignments')
    .select('*')
    .in('registration_id', regIds)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const filtered = (data ?? []).filter((assignment: { registration_id: string; item_date?: string | null }) => {
    const selectedDates = regDatesById.get(assignment.registration_id)
    if (multiDateFieldIds.length === 0) return true
    if (!selectedDates || selectedDates.size === 0) return false
    if (!assignment.item_date) return false
    return selectedDates.has(assignment.item_date)
  })

  return NextResponse.json(filtered)
}

/** POST /api/events/[id]/schedule-assignments
 *  Body: { registration_id, time_slot_id, item_date? }
 *  Upserts: one slot per (registration_id, item_date).
 */
export async function POST(req: Request, { params }: Params) {
  const { id } = await params

  const authResult = await checkRoleForApi(['organizer', 'admin'])
  if ('error' in authResult) return authResult.error

  const supabase = createServerClient()

  const { data: event } = await supabase
    .from('events')
    .select('created_by, form_fields')
    .eq('id', id)
    .single()
  if (!event) return NextResponse.json({ error: 'Nie znaleziono eventu' }, { status: 404 })
  if (authResult.role !== 'admin' && event.created_by !== authResult.user.id)
    return NextResponse.json({ error: 'Brak uprawnień' }, { status: 403 })

  let body: { registration_id: string; time_slot_id: string; item_date?: string }
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Nieprawidłowe JSON' }, { status: 400 }) }

  const { registration_id, time_slot_id, item_date = '' } = body
  if (!registration_id || !time_slot_id)
    return NextResponse.json({ error: 'Wymagane: registration_id, time_slot_id' }, { status: 400 })

  const [{ data: registration }, { data: slot }] = await Promise.all([
    supabase
      .from('registrations')
      .select('id, event_id, status, form_data')
      .eq('id', registration_id)
      .maybeSingle(),
    supabase
      .from('time_slots')
      .select('id, event_id, slot_date, max_participants')
      .eq('id', time_slot_id)
      .maybeSingle(),
  ])

  if (!registration || !slot) {
    return NextResponse.json({ error: 'Nie znaleziono zgłoszenia lub terminu' }, { status: 404 })
  }
  if (registration.event_id !== id || slot.event_id !== id || registration.status !== 'confirmed') {
    return NextResponse.json({ error: 'Aktywne zgłoszenie i termin muszą należeć do tego wydarzenia' }, { status: 409 })
  }

  const multidateFieldIds = Array.isArray(event.form_fields)
    ? (event.form_fields as Array<{ id?: unknown; type?: unknown }>)
        .filter(field => field.type === 'multidate' && typeof field.id === 'string')
        .map(field => field.id as string)
    : []

  if (multidateFieldIds.length > 0) {
    const formData = (registration.form_data ?? {}) as Record<string, unknown>
    const selectedDates = multidateFieldIds.flatMap(fieldId =>
      Array.isArray(formData[fieldId]) ? formData[fieldId] as string[] : []
    )
    if (!item_date || item_date !== slot.slot_date) {
      return NextResponse.json({ error: 'Data przypisania nie zgadza się z datą terminu' }, { status: 409 })
    }
    if (!selectedDates.includes(item_date)) {
      return NextResponse.json({ error: 'Uczestnik nie jest zapisany na tę datę' }, { status: 409 })
    }
  } else if (item_date && item_date !== slot.slot_date) {
    return NextResponse.json({ error: 'Data przypisania nie zgadza się z datą terminu' }, { status: 409 })
  }

  if (typeof slot.max_participants === 'number' && slot.max_participants > 0) {
    const [{ count }, { data: existingAssignment }] = await Promise.all([
      supabase
        .from('schedule_assignments')
        .select('id', { count: 'exact', head: true })
        .eq('time_slot_id', time_slot_id),
      supabase
        .from('schedule_assignments')
        .select('id, time_slot_id')
        .eq('registration_id', registration_id)
        .eq('item_date', item_date)
        .maybeSingle(),
    ])
    if (existingAssignment?.time_slot_id !== time_slot_id && (count ?? 0) >= slot.max_participants) {
      return NextResponse.json({ error: 'Brak wolnych miejsc w tym terminie' }, { status: 409 })
    }
  }

  const { data, error } = await supabase
    .from('schedule_assignments')
    .upsert(
      { registration_id, time_slot_id, item_date, sent_at: null },
      { onConflict: 'registration_id,item_date' }
    )
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

/** DELETE /api/events/[id]/schedule-assignments
 *  Body: { assignment_id }
 */
export async function DELETE(req: Request, { params }: Params) {
  const { id } = await params

  const authResult = await checkRoleForApi(['organizer', 'admin'])
  if ('error' in authResult) return authResult.error

  const supabase = createServerClient()

  const { data: event } = await supabase.from('events').select('created_by').eq('id', id).single()
  if (!event) return NextResponse.json({ error: 'Nie znaleziono eventu' }, { status: 404 })
  if (authResult.role !== 'admin' && event.created_by !== authResult.user.id)
    return NextResponse.json({ error: 'Brak uprawnień' }, { status: 403 })

  let body: { assignment_id: string }
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Nieprawidłowe JSON' }, { status: 400 }) }

  const { error } = await supabase
    .from('schedule_assignments')
    .delete()
    .eq('id', body.assignment_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
