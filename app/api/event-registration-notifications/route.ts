import { NextResponse } from 'next/server'
import { createServerClient, hasServiceRoleKey } from '@/lib/supabaseServer'
import { sendRegistrationOpenedEmail } from '@/lib/email'

async function processRegistrationOpeningNotifications(req: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    return NextResponse.json({ error: 'CRON_SECRET nie jest skonfigurowany' }, { status: 503 })
  }
  const provided = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (provided !== cronSecret) return NextResponse.json({ error: 'Brak uprawnień' }, { status: 401 })
  if (!hasServiceRoleKey()) {
    return NextResponse.json({ error: 'Brak konfiguracji serwera powiadomień' }, { status: 503 })
  }

  const supabase = createServerClient()
  const now = new Date()
  const staleClaim = new Date(now.getTime() - 30 * 60 * 1000).toISOString()
  const { data: events, error: eventsError } = await supabase
    .from('events')
    .select('id, slug, title, start_at, location, registration_opens_at, registration_deadline')
    .eq('status', 'upcoming')
    .not('registration_opens_at', 'is', null)
    .lte('registration_opens_at', now.toISOString())
    .limit(100)

  if (eventsError) {
    return NextResponse.json({ error: 'Nie udało się pobrać otwartych zapisów' }, { status: 500 })
  }

  let sent = 0
  let skipped = 0
  const errors: string[] = []

  for (const event of events ?? []) {
    if (event.registration_deadline && new Date(event.registration_deadline) <= now) {
      skipped += 1
      continue
    }

    const { data: pending } = await supabase
      .from('event_registration_notifications')
      .select('id, email')
      .eq('event_id', event.id)
      .is('notified_at', null)
      .or(`claimed_at.is.null,claimed_at.lt.${staleClaim}`)
      .limit(500)

    for (const subscription of pending ?? []) {
      const claimedAt = new Date().toISOString()
      const { data: claim } = await supabase
        .from('event_registration_notifications')
        .update({ claimed_at: claimedAt, last_error: null })
        .eq('id', subscription.id)
        .is('notified_at', null)
        .or(`claimed_at.is.null,claimed_at.lt.${staleClaim}`)
        .select('id')
        .maybeSingle()

      if (!claim) {
        skipped += 1
        continue
      }

      try {
        await sendRegistrationOpenedEmail({
          to: subscription.email,
          eventTitle: event.title,
          eventSlug: event.slug,
          eventDate: event.start_at,
          eventLocation: event.location,
        })
        await supabase
          .from('event_registration_notifications')
          .update({ notified_at: new Date().toISOString(), claimed_at: null })
          .eq('id', subscription.id)
          .eq('claimed_at', claimedAt)
        sent += 1
      } catch (sendError) {
        const message = sendError instanceof Error ? sendError.message : String(sendError)
        await supabase
          .from('event_registration_notifications')
          .update({ claimed_at: null, last_error: message.slice(0, 1000) })
          .eq('id', subscription.id)
          .eq('claimed_at', claimedAt)
        errors.push(`${subscription.id}: ${message}`)
      }
    }
  }

  return NextResponse.json({ sent, skipped, errors: errors.length ? errors : undefined })
}

// Supabase Cron invokes this endpoint with POST through pg_net. GET remains
// available for an authenticated manual run and backwards compatibility.
export const POST = processRegistrationOpeningNotifications
export const GET = processRegistrationOpeningNotifications
