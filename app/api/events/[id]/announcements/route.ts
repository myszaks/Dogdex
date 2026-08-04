import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabaseServer'
import { getServerUser } from '@/lib/getServerUser'
import { isOrganizerRole } from '@/lib/roles'
import { processPendingAnnouncementDeliveries } from '@/lib/eventAnnouncements'

interface Params { params: Promise<{ id: string }> }

type Audience = 'confirmed' | 'active' | 'waitlist'

interface Recipient {
  participantId: string
  email: string
  dogNames: string[]
}

function one<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null
}

async function loadEvent(id: string) {
  const supabase = createServerClient()
  const { data } = await supabase
    .from('events')
    .select('id, slug, title, created_by')
    .eq(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) ? 'id' : 'slug', id)
    .maybeSingle()
  return data
}

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params
  const { user, role } = await getServerUser()
  if (!user?.email) return NextResponse.json({ error: 'Brak uprawnień' }, { status: 401 })

  const event = await loadEvent(id)
  if (!event) return NextResponse.json({ error: 'Nie znaleziono wydarzenia' }, { status: 404 })
  const supabase = createServerClient()
  const managesEvent = isOrganizerRole(role) && (role === 'admin' || event.created_by === user.id)

  if (managesEvent) {
    const { data, error } = await supabase
      .from('event_announcements')
      .select('*')
      .eq('event_id', event.id)
      .order('created_at', { ascending: false })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data ?? [])
  }

  const { data: deliveries, error: deliveryError } = await supabase
    .from('event_announcement_deliveries')
    .select('announcement_id')
    .ilike('recipient_email', user.email)
    .eq('status', 'sent')
  if (deliveryError) return NextResponse.json({ error: deliveryError.message }, { status: 500 })
  const ids = [...new Set((deliveries ?? []).map(delivery => delivery.announcement_id as string))]
  if (ids.length === 0) return NextResponse.json([])

  const { data, error } = await supabase
    .from('event_announcements')
    .select('id, title, body, created_at')
    .eq('event_id', event.id)
    .in('id', ids)
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: Request, { params }: Params) {
  const { id } = await params
  const { user, role } = await getServerUser()
  if (!user || !isOrganizerRole(role)) {
    return NextResponse.json({ error: 'Brak uprawnień' }, { status: 403 })
  }

  const event = await loadEvent(id)
  if (!event) return NextResponse.json({ error: 'Nie znaleziono wydarzenia' }, { status: 404 })
  if (role !== 'admin' && event.created_by !== user.id) {
    return NextResponse.json({ error: 'Brak uprawnień' }, { status: 403 })
  }

  let body: { title?: unknown; message?: unknown; audience?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Nieprawidłowe dane' }, { status: 400 })
  }
  const title = typeof body.title === 'string' ? body.title.trim() : ''
  const message = typeof body.message === 'string' ? body.message.trim() : ''
  const audience = body.audience as Audience
  if (!title || title.length > 120) {
    return NextResponse.json({ error: 'Tytuł musi mieć od 1 do 120 znaków' }, { status: 400 })
  }
  if (!message || message.length > 5000) {
    return NextResponse.json({ error: 'Treść musi mieć od 1 do 5000 znaków' }, { status: 400 })
  }
  if (!['confirmed', 'active', 'waitlist'].includes(audience)) {
    return NextResponse.json({ error: 'Wybierz prawidłową grupę odbiorców' }, { status: 400 })
  }

  const supabase = createServerClient()
  const recipients = new Map<string, Recipient>()

  if (audience === 'waitlist') {
    const { data } = await supabase
      .from('event_waitlist_entries')
      .select('participant_id, participants(id, owner_email, dog_name)')
      .eq('event_id', event.id)
      .in('status', ['waiting', 'offered'])
    for (const row of data ?? []) {
      const participant = one(row.participants)
      if (!participant?.owner_email) continue
      const email = participant.owner_email.trim().toLowerCase()
      const existing = recipients.get(email)
      if (existing && participant.dog_name && !existing.dogNames.includes(participant.dog_name)) {
        existing.dogNames.push(participant.dog_name)
      } else if (!existing) {
        recipients.set(email, {
          participantId: participant.id,
          email,
          dogNames: participant.dog_name ? [participant.dog_name] : [],
        })
      }
    }
  } else {
    const statuses = audience === 'confirmed' ? ['confirmed'] : ['pending', 'confirmed']
    const { data } = await supabase
      .from('registrations')
      .select('participant_id, participants(id, owner_email, dog_name)')
      .eq('event_id', event.id)
      .in('status', statuses)
    for (const row of data ?? []) {
      const participant = one(row.participants)
      if (!participant?.owner_email) continue
      const email = participant.owner_email.trim().toLowerCase()
      const existing = recipients.get(email)
      if (existing && participant.dog_name && !existing.dogNames.includes(participant.dog_name)) {
        existing.dogNames.push(participant.dog_name)
      } else if (!existing) {
        recipients.set(email, {
          participantId: participant.id,
          email,
          dogNames: participant.dog_name ? [participant.dog_name] : [],
        })
      }
    }
  }

  const recipientList = [...recipients.values()]
  const { data: announcement, error: announcementError } = await supabase
    .from('event_announcements')
    .insert({
      event_id: event.id,
      created_by: user.id,
      title,
      body: message,
      audience,
      recipient_count: recipientList.length,
    })
    .select('*')
    .single()
  if (announcementError || !announcement) {
    return NextResponse.json({ error: announcementError?.message ?? 'Nie udało się zapisać komunikatu' }, { status: 500 })
  }

  if (recipientList.length > 0) {
    const { error: deliveriesError } = await supabase.from('event_announcement_deliveries').insert(recipientList.map(recipient => ({
      announcement_id: announcement.id,
      participant_id: recipient.participantId,
      recipient_email: recipient.email,
      dog_names: recipient.dogNames,
    })))
    if (deliveriesError) {
      await supabase.from('event_announcements').delete().eq('id', announcement.id)
      return NextResponse.json({ error: 'Nie udało się przygotować wysyłki komunikatu' }, { status: 500 })
    }
  }

  await processPendingAnnouncementDeliveries({ announcementId: announcement.id, limit: 20 })

  const { data: updated } = await supabase
    .from('event_announcements')
    .select('*')
    .eq('id', announcement.id)
    .single()

  return NextResponse.json(updated ?? announcement, { status: 201 })
}
