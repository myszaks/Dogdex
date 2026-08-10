import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabaseServer'
import { requireEventAccessForApi } from '@/lib/eventAccess'
import { sendEventStartApproachingEmail } from '@/lib/email'
import { optimizeEventDayQueue } from '@/lib/eventDay'

interface Params { params: Promise<{ id: string }> }

type CheckInItem = {
  token?: string
  checkedIn?: boolean
  clientMutationId?: string
  occurredAt?: string
  source?: 'manual' | 'qr' | 'offline' | 'bulk'
}

export async function POST(req: Request, { params }: Params) {
  const { id } = await params
  const auth = await requireEventAccessForApi(id, 'checkin')
  if ('error' in auth) return auth.error
  const db = createServerClient()

  let body: { action?: string; items?: CheckInItem[]; count?: number }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Nieprawidłowe JSON' }, { status: 400 })
  }

  const { data: event } = await db
    .from('events')
    .select('id, slug, title, status, live_phase, current_start_index')
    .eq('id', id)
    .maybeSingle()
  if (!event) return NextResponse.json({ error: 'Nie znaleziono wydarzenia' }, { status: 404 })
  if (event.status === 'finished' || event.status === 'cancelled') {
    return NextResponse.json({ error: 'Event Day jest zablokowany dla zakończonego wydarzenia' }, { status: 409 })
  }

  if (body.action === 'checkin_batch') {
    const items = Array.isArray(body.items) ? body.items.slice(0, 100) : []
    if (items.length === 0 || items.some(item => typeof item.token !== 'string')) {
      return NextResponse.json({ error: 'Przekaż co najmniej jeden kod odprawy' }, { status: 400 })
    }
    const tokens = [...new Set(items.map(item => item.token as string))]
    const { data: registrations } = await db
      .from('registrations')
      .select('id, checkin_token, checked_in, participants(dog_name, owner_name)')
      .eq('event_id', id)
      .eq('status', 'confirmed')
      .in('checkin_token', tokens)
    const byToken = new Map((registrations ?? []).map(registration => [registration.checkin_token, registration]))
    const results: Array<Record<string, unknown>> = []

    for (const item of items) {
      const registration = byToken.get(item.token as string)
      if (!registration) {
        results.push({ token: item.token, ok: false, error: 'Kod nie należy do potwierdzonego zapisu' })
        continue
      }
      if (item.clientMutationId) {
        const { data: previous } = await db
          .from('event_checkin_log')
          .select('id')
          .eq('client_mutation_id', item.clientMutationId)
          .maybeSingle()
        if (previous) {
          results.push({ token: item.token, registrationId: registration.id, ok: true, duplicate: true })
          continue
        }
      }
      const checkedIn = item.checkedIn !== false
      const occurredAt = item.occurredAt && !Number.isNaN(new Date(item.occurredAt).getTime())
        ? item.occurredAt
        : new Date().toISOString()
      const { error: updateError } = await db.from('registrations').update({
        checked_in: checkedIn,
        checked_in_at: checkedIn ? occurredAt : null,
      }).eq('id', registration.id).eq('event_id', id)
      if (updateError) {
        results.push({ token: item.token, registrationId: registration.id, ok: false, error: 'Nie udało się zapisać odprawy' })
        continue
      }
      await db.from('event_checkin_log').insert({
        event_id: id,
        registration_id: registration.id,
        operator_id: auth.access.user.id,
        action: checkedIn ? 'checked_in' : 'checked_out',
        source: item.source ?? 'qr',
        client_mutation_id: item.clientMutationId ?? null,
        occurred_at: occurredAt,
      })
      const participant = Array.isArray(registration.participants)
        ? registration.participants[0]
        : registration.participants
      results.push({
        token: item.token,
        registrationId: registration.id,
        dogName: participant?.dog_name ?? '',
        ownerName: participant?.owner_name ?? '',
        checkedIn,
        ok: true,
      })
    }
    return NextResponse.json({ results })
  }

  if (body.action === 'optimize_queue') {
    if (event.live_phase === 'running') {
      return NextResponse.json({ error: 'Nie można automatycznie zmieniać kolejki po rozpoczęciu startów' }, { status: 409 })
    }
    const { data: registrations, error } = await db
      .from('registrations')
      .select('id, checked_in, order_index, created_at')
      .eq('event_id', id)
      .eq('status', 'confirmed')
      .order('order_index', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true })
    if (error) return NextResponse.json({ error: 'Nie udało się pobrać kolejki' }, { status: 500 })
    const ordered = optimizeEventDayQueue(registrations ?? [])
    const updates = await Promise.all(ordered.map((registration, index) =>
      db.from('registrations').update({ order_index: index + 1 }).eq('id', registration.id)
    ))
    if (updates.some(result => result.error)) {
      return NextResponse.json({ error: 'Nie udało się zapisać zoptymalizowanej kolejki' }, { status: 500 })
    }
    return NextResponse.json({ ok: true, order: ordered.map(registration => registration.id) })
  }

  if (body.action === 'notify_next') {
    const count = Number.isInteger(body.count) ? Math.min(10, Math.max(1, body.count as number)) : 3
    const { data: registrations } = await db
      .from('registrations')
      .select('id, order_index, participants(owner_email, owner_name, dog_name)')
      .eq('event_id', id)
      .eq('status', 'confirmed')
      .eq('checked_in', true)
      .order('order_index', { ascending: true, nullsFirst: false })
    const current = Math.max(0, event.current_start_index ?? 0)
    const targets = (registrations ?? []).slice(current + 1, current + 1 + count)
    let sent = 0
    for (const [index, registration] of targets.entries()) {
      const participant = Array.isArray(registration.participants) ? registration.participants[0] : registration.participants
      if (!participant?.owner_email) continue
      const { data: notification } = await db.from('event_start_notifications').insert({
        event_id: id,
        registration_id: registration.id,
        sent_by: auth.access.user.id,
        status: 'pending',
      }).select('id').single()
      const delivered = await sendEventStartApproachingEmail({
        to: participant.owner_email,
        ownerName: participant.owner_name ?? '',
        dogName: participant.dog_name ?? 'Twój pies',
        eventTitle: event.title,
        eventSlug: event.slug,
        startsBefore: index + 1,
      })
      if (notification) await db.from('event_start_notifications').update({
        status: delivered ? 'sent' : 'failed',
        sent_at: delivered ? new Date().toISOString() : null,
        error_message: delivered ? null : 'Kanał e-mail jest niedostępny',
      }).eq('id', notification.id)
      if (delivered) sent += 1
    }
    return NextResponse.json({ ok: true, sent, targeted: targets.length })
  }

  return NextResponse.json({ error: 'Nieprawidłowa akcja Event Day' }, { status: 400 })
}
