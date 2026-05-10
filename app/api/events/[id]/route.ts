import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabaseServer'
import { checkRoleForApi } from '@/lib/getServerUser'
import { sendEventChangeEmail } from '@/lib/email'

interface Params {
  params: Promise<{ id: string }>
}

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params
  const supabase = createServerClient()
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

  const supabase = createServerClient()

  // Fetch existing event (for ownership check + change detection)
  const { data: existingEvent } = await supabase
    .from('events')
    .select('created_by, start_at, end_at, location, title, status')
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
    'has_results', 'results_public', 'auto_confirm', 'max_participants', 'organizer_name', 'slug',
    'lat', 'lng', 'gallery_images', 'grouping_field', 'current_start_index',
  ]
  const update: Record<string, unknown> = {}
  for (const field of allowedFields) {
    if (field in body) update[field] = body[field]
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

export async function DELETE(_req: Request, { params }: Params) {
  const { id } = await params
  const supabase = createServerClient()
  const { error } = await supabase.from('events').delete().eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
