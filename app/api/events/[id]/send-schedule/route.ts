import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabaseServer'
import { checkRoleForApi } from '@/lib/getServerUser'
import { sendScheduleEmail } from '@/lib/email'

interface Params {
  params: Promise<{ id: string }>
}

export async function POST(req: Request, { params }: Params) {
  const { id } = await params

  const authResult = await checkRoleForApi(['organizer', 'admin'])
  if ('error' in authResult) return authResult.error

  const supabase = createServerClient()

  // Verify ownership
  const { data: event } = await supabase
    .from('events')
    .select('created_by, title, start_at, location')
    .eq('id', id)
    .single()

  if (!event) return NextResponse.json({ error: 'Nie znaleziono eventu' }, { status: 404 })
  if (authResult.role !== 'admin' && event.created_by !== authResult.user.id) {
    return NextResponse.json({ error: 'Brak uprawnień' }, { status: 403 })
  }

  // Optionally accept a list of registration ids to send to (or send to all)
  let body: { registrationIds?: string[] } = {}
  try { body = await req.json() } catch { /* send to all */ }

  // Fetch registrations with time_slot_id set
  let regQuery = supabase
    .from('registrations')
    .select('id, time_slot_id, schedule_sent_at, participants(owner_email, owner_name, dog_name)')
    .eq('event_id', id)
    .eq('status', 'confirmed')
    .not('time_slot_id', 'is', null)

  if (body.registrationIds?.length) {
    regQuery = regQuery.in('id', body.registrationIds)
  }

  const { data: registrations } = await regQuery

  if (!registrations?.length) {
    return NextResponse.json({ error: 'Brak uczestników z przypisanym slotem' }, { status: 400 })
  }

  // Fetch all relevant time_slots
  const slotIds = [...new Set(registrations.map(r => r.time_slot_id as string))]
  const { data: slots } = await supabase
    .from('time_slots')
    .select('*')
    .in('id', slotIds)

  const slotMap = new Map((slots ?? []).map(s => [s.id, s]))

  let sent = 0
  let failed = 0
  const sentIds: string[] = []

  for (const reg of registrations) {
    const slot = slotMap.get(reg.time_slot_id as string)
    if (!slot) continue

    const p = (reg as Record<string, unknown>).participants as Record<string, string> | null
    if (!p?.owner_email) continue

    try {
      await sendScheduleEmail({
        to: p.owner_email,
        ownerName: p.owner_name ?? '',
        dogName: p.dog_name ?? '',
        eventTitle: event.title,
        eventDate: event.start_at ?? null,
        eventLocation: event.location ?? null,
        slotDate: slot.slot_date,
        slotTime: slot.slot_time,
        slotLabel: slot.label ?? null,
      })
      sentIds.push(reg.id)
      sent++
    } catch {
      failed++
    }
  }

  // Mark schedule_sent_at for successfully sent registrations
  if (sentIds.length > 0) {
    await supabase
      .from('registrations')
      .update({ schedule_sent_at: new Date().toISOString() })
      .in('id', sentIds)
  }

  return NextResponse.json({ sent, failed })
}
