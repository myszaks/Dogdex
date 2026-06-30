import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabaseServer'
import { sendReminderEmail } from '@/lib/email'
import { getIsoDateInTimeZone, hasMultidateSelection, shouldSendMultidateReminder } from '@/lib/reminders'
import { formatEmailDate } from '@/lib/emailDate'

/**
 * GET /api/reminders
 *
 * Sends 24h-before reminder emails. Should be called by a cron job once per day.
 *
 * Security: requires `Authorization: Bearer <CRON_SECRET>` header
 * or `?secret=<CRON_SECRET>` query param.
 *
 * Logic:
 *  1. Regular events: start_at falls within the next 20–28h window.
 *  2. Multidate events: any registration has multidate dates that fall tomorrow.
 *
 * Set CRON_SECRET in your env to protect this endpoint.
 */
export async function GET(req: Request) {
  // Auth guard
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const { searchParams } = new URL(req.url)
    const authHeader = req.headers.get('authorization') ?? ''
    const querySecret = searchParams.get('secret') ?? ''
    const provided = authHeader.replace(/^Bearer\s+/i, '') || querySecret
    if (provided !== cronSecret) {
      return NextResponse.json({ error: 'Brak uprawnień' }, { status: 401 })
    }
  }

  const supabase = createServerClient()

  const now = new Date()
  // Window: events/dates starting 20h–28h from now (24h ± 4h)
  const windowStart = new Date(now.getTime() + 20 * 60 * 60 * 1000)
  const windowEnd = new Date(now.getTime() + 28 * 60 * 60 * 1000)

  // Tomorrow's date as ISO date string (YYYY-MM-DD)
  const tomorrow = new Date(now)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const tomorrowDate = getIsoDateInTimeZone(tomorrow)

  let sent = 0
  let skipped = 0
  const errors: string[] = []

  // ── 1. Regular events (non-multidate) starting in ~24h ──────────────────
  const { data: upcomingEvents } = await supabase
    .from('events')
    .select('id, title, start_at, location')
    .gte('start_at', windowStart.toISOString())
    .lte('start_at', windowEnd.toISOString())
    .eq('status', 'upcoming')

  for (const event of upcomingEvents ?? []) {
    const { data: registrations } = await supabase
      .from('registrations')
      .select('id, form_data, reminder_sent_at, participants(dog_name, owner_name, owner_email)')
      .eq('event_id', event.id)
      .eq('status', 'confirmed')

    for (const reg of registrations ?? []) {
      // Skip if reminder already sent for this registration (no multidate context here)
      if ((reg as Record<string, unknown>).reminder_sent_at) { skipped++; continue }

      const p = (reg as Record<string, unknown>).participants as Record<string, string> | null
      if (!p?.owner_email) { skipped++; continue }

      // Check if this event has multidate fields — if so, skip here (handled in section 2)
      const formData = (reg.form_data ?? {}) as Record<string, unknown>
      const hasMultidate = hasMultidateSelection(formData)
      if (hasMultidate) { skipped++; continue }

      const eventDate = event.start_at
        ? formatEmailDate(event.start_at, { weekday: true })
        : null

      try {
        await sendReminderEmail({
          to: p.owner_email,
          ownerName: p.owner_name ?? '',
          dogName: p.dog_name ?? '',
          eventTitle: event.title,
          eventDate,
          eventLocation: event.location ?? null,
          reminderDates: null,
        })
        // Mark reminder sent
        await supabase
          .from('registrations')
          .update({ reminder_sent_at: new Date().toISOString() })
          .eq('id', reg.id)
        sent++
      } catch (e) {
        errors.push(`reg ${reg.id}: ${String(e)}`)
      }
    }
  }

  // ── 2. Multidate events: find registrations with tomorrow's date ─────────
  // Fetch ALL confirmed registrations with form_data containing tomorrow's date
  // We query registrations joined with events that have form_fields of type multidate
  const { data: multidateRegs } = await supabase
    .from('registrations')
    .select('id, form_data, reminder_sent_at, event_id, events(id, title, status, start_at, end_at, location, form_fields), participants(dog_name, owner_name, owner_email)')
    .eq('status', 'confirmed')

  for (const reg of multidateRegs ?? []) {
    const event = (reg as Record<string, unknown>).events as Record<string, unknown> | null
    if (!event) continue

    const eventFormFields = Array.isArray(event.form_fields)
      ? (event.form_fields as Array<{ id: string; type: string }>)
      : []
    if (!shouldSendMultidateReminder({
      status: String(event.status ?? 'upcoming'),
      start_at: event.start_at ? String(event.start_at) : null,
      end_at: event.end_at ? String(event.end_at) : null,
    })) continue

    const multidateFieldIds = eventFormFields.filter(f => f.type === 'multidate').map(f => f.id)
    if (!multidateFieldIds.length) continue

    const formData = (reg.form_data ?? {}) as Record<string, unknown>

    // Collect dates for tomorrow across all multidate fields
    const tomorrowDates: string[] = []
    for (const fieldId of multidateFieldIds) {
      const dates = Array.isArray(formData[fieldId]) ? (formData[fieldId] as string[]) : []
      for (const d of dates) {
        if (d.startsWith(tomorrowDate)) tomorrowDates.push(d)
      }
    }

    if (!tomorrowDates.length) continue

    // Check reminder_sent_at — use a compound key: reminder_sent_<date>
    const reminderKey = `reminder_sent_${tomorrowDate}`
    const alreadySent = ((reg as Record<string, unknown>)[reminderKey] as boolean | undefined) === true
    // Fallback: check reminder_sent_at column which is a JSON of { [date]: true }
    const reminderSentAt = (reg as Record<string, unknown>).reminder_sent_at as string | Record<string, boolean> | null
    if (reminderSentAt && typeof reminderSentAt === 'object' && (reminderSentAt as Record<string, boolean>)[tomorrowDate]) {
      skipped++; continue
    }
    if (alreadySent) { skipped++; continue }

    const p = (reg as Record<string, unknown>).participants as Record<string, string> | null
    if (!p?.owner_email) { skipped++; continue }

    const eventDate = event.start_at
      ? formatEmailDate(event.start_at as string, { weekday: true })
      : null

    try {
      await sendReminderEmail({
        to: p.owner_email,
        ownerName: p.owner_name ?? '',
        dogName: p.dog_name ?? '',
        eventTitle: String(event.title ?? ''),
        eventDate,
        eventLocation: event.location ? String(event.location) : null,
        reminderDates: tomorrowDates,
      })

      // Track which dates reminders were sent for (store as JSON object in reminder_sent_at)
      const existing = typeof reminderSentAt === 'object' && reminderSentAt !== null
        ? (reminderSentAt as Record<string, boolean>)
        : {}
      await supabase
        .from('registrations')
        .update({ reminder_sent_at: { ...existing, [tomorrowDate]: true } })
        .eq('id', reg.id)
      sent++
    } catch (e) {
      errors.push(`multidate reg ${reg.id}: ${String(e)}`)
    }
  }

  return NextResponse.json({ sent, skipped, errors: errors.length ? errors : undefined })
}
