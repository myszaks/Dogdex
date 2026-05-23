import { NextResponse } from 'next/server'
import { createAuthClient } from '@/lib/supabaseServer'
import { checkRoleForApi } from '@/lib/getServerUser'
import { sendScheduleEmail } from '@/lib/email'

interface Params {
  params: Promise<{ id: string }>
}

export async function POST(req: Request, { params }: Params) {
  const { id } = await params

  const authResult = await checkRoleForApi(['organizer', 'admin'])
  if ('error' in authResult) return authResult.error

  const supabase = await createAuthClient()

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

  // Optionally accept a list of assignment ids to send to (or send to all)
  let body: { assignmentIds?: string[] } = {}
  try { body = await req.json() } catch { /* send to all */ }

  // Fetch confirmed registrations for this event
  const { data: regs } = await supabase
    .from('registrations')
    .select('id, participants(owner_email, owner_name, dog_name)')
    .eq('event_id', id)
    .eq('status', 'confirmed')

  const regIds = (regs ?? []).map(r => r.id as string)
  if (!regIds.length) {
    return NextResponse.json({ error: 'Brak potwierdzonych uczestników' }, { status: 400 })
  }

  const regMap = new Map((regs ?? []).map(r => [r.id as string, r]))

  // Fetch schedule_assignments
  let assignQuery = supabase
    .from('schedule_assignments')
    .select('*')
    .in('registration_id', regIds)

  if (body.assignmentIds?.length) {
    assignQuery = assignQuery.in('id', body.assignmentIds)
  }

  const { data: assignments } = await assignQuery

  if (!assignments?.length) {
    return NextResponse.json({ error: 'Brak uczestników z przypisanym slotem' }, { status: 400 })
  }

  // Fetch slots
  const slotIds = [...new Set(assignments.map(a => a.time_slot_id as string))]
  const { data: slots } = await supabase
    .from('time_slots')
    .select('*')
    .in('id', slotIds)

  const slotMap = new Map((slots ?? []).map(s => [s.id, s]))

  let sent = 0
  let failed = 0
  const sentIds: string[] = []

  for (const assignment of assignments) {
    const slot = slotMap.get(assignment.time_slot_id)
    if (!slot) continue

    const reg = regMap.get(assignment.registration_id)
    const p = reg?.participants as { owner_email?: string; owner_name?: string; dog_name?: string } | null
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
      sentIds.push(assignment.id)
      sent++
    } catch {
      failed++
    }
  }

  // Mark sent_at on assignments
  if (sentIds.length > 0) {
    await supabase
      .from('schedule_assignments')
      .update({ sent_at: new Date().toISOString() })
      .in('id', sentIds)
  }

  return NextResponse.json({ sent, failed })
}
