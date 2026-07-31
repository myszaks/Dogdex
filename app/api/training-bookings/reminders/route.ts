import { NextResponse } from 'next/server'
import { sendTrainingReminder } from '@/lib/email'
import { formatEmailDateTime } from '@/lib/emailDate'
import { createServerClient, hasServiceRoleKey } from '@/lib/supabaseServer'

interface ClaimedReminder {
  booking_id: string
  claimed_at: string
}

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null
}

export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    return NextResponse.json({ error: 'CRON_SECRET nie jest skonfigurowany' }, { status: 503 })
  }
  const provided = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (provided !== cronSecret) {
    return NextResponse.json({ error: 'Brak uprawnień' }, { status: 401 })
  }
  if (!hasServiceRoleKey()) {
    return NextResponse.json({ error: 'Brak konfiguracji serwera przypomnień' }, { status: 503 })
  }

  const supabase = createServerClient()
  const now = new Date()
  const windowStart = new Date(now.getTime() + 23 * 60 * 60 * 1000)
  const windowEnd = new Date(now.getTime() + 25 * 60 * 60 * 1000)
  const { data: claimed, error: claimError } = await supabase.rpc('claim_training_reminders', {
    window_start: windowStart.toISOString(),
    window_end: windowEnd.toISOString(),
    batch_size: 100,
  })

  if (claimError) {
    console.error('[training-reminders] Failed to claim reminders:', claimError)
    return NextResponse.json({ error: 'Nie udało się pobrać przypomnień' }, { status: 500 })
  }

  const claims = (claimed ?? []) as ClaimedReminder[]
  if (claims.length === 0) {
    return NextResponse.json({ claimed: 0, sent: 0, failed: 0 })
  }

  const claimByBookingId = new Map(claims.map(claim => [claim.booking_id, claim]))
  const { data: bookings, error: bookingsError } = await supabase
    .from('training_bookings')
    .select('id, user_id, scheduled_at, duration_min, training_types(name, trainer_id)')
    .in('id', claims.map(claim => claim.booking_id))

  if (bookingsError) {
    await Promise.all(claims.map(claim => supabase.rpc('release_training_reminder_claim', {
      target_booking_id: claim.booking_id,
      target_claimed_at: claim.claimed_at,
    })))
    return NextResponse.json({ error: 'Nie udało się pobrać danych przypomnień' }, { status: 500 })
  }

  const trainerIds = [...new Set(
    (bookings ?? []).flatMap(booking => firstRelation(booking.training_types)?.trainer_id
      ? [firstRelation(booking.training_types)!.trainer_id]
      : []),
  )]
  const { data: trainerProfiles } = trainerIds.length > 0
    ? await supabase
      .from('trainer_profiles')
      .select('trainer_id, full_name')
      .in('trainer_id', trainerIds)
    : { data: [] }
  const trainerNameById = new Map(
    (trainerProfiles ?? []).map(profile => [profile.trainer_id, profile.full_name]),
  )

  let sent = 0
  let failed = 0
  const errors: string[] = []

  for (const booking of bookings ?? []) {
    const claim = claimByBookingId.get(booking.id)
    const trainingType = firstRelation(booking.training_types)
    const trainerId = trainingType?.trainer_id
    try {
      const { data: authUser, error: userError } = await supabase.auth.admin.getUserById(booking.user_id)
      const recipient = authUser.user
      if (userError || !recipient?.email || !trainerId) {
        throw new Error('Brak adresu e-mail użytkownika lub danych trenera')
      }
      const delivered = await sendTrainingReminder({
        to: recipient.email,
        userName: recipient.user_metadata?.full_name || 'Użytkownik',
        trainerName: trainerNameById.get(trainerId) || 'Trener',
        trainingType: trainingType?.name || 'Trening indywidualny',
        trainingDate: formatEmailDateTime(booking.scheduled_at),
        duration: booking.duration_min,
      })
      if (!delivered) throw new Error('SMTP nie jest skonfigurowane lub odrzuciło wiadomość')
      sent += 1
    } catch (error) {
      failed += 1
      errors.push(`${booking.id}: ${String(error)}`)
      if (claim) {
        await supabase.rpc('release_training_reminder_claim', {
          target_booking_id: claim.booking_id,
          target_claimed_at: claim.claimed_at,
        })
      }
    }
  }

  const returnedBookingIds = new Set((bookings ?? []).map(booking => booking.id))
  for (const claim of claims) {
    if (returnedBookingIds.has(claim.booking_id)) continue
    failed += 1
    await supabase.rpc('release_training_reminder_claim', {
      target_booking_id: claim.booking_id,
      target_claimed_at: claim.claimed_at,
    })
  }

  return NextResponse.json({
    claimed: claims.length,
    sent,
    failed,
    errors: errors.length > 0 ? errors : undefined,
  })
}
