import { createServerClient } from '@/lib/supabaseServer'
import { sendEventWaitlistOfferEmail } from '@/lib/email'

const OFFER_DURATION_MINUTES = 12 * 60
const MAX_OFFERS_PER_EVENT_RUN = 50

function appUrl() {
  return (
    process.env.NEXT_PUBLIC_APP_URL
    ?? process.env.NEXT_PUBLIC_SITE_URL
    ?? 'https://dogdex.pro'
  ).replace(/\/$/, '')
}

export interface WaitlistProcessingResult {
  offered: number
  errors: string[]
}

export async function processEventWaitlist(eventId: string): Promise<WaitlistProcessingResult> {
  const supabase = createServerClient()
  const result: WaitlistProcessingResult = { offered: 0, errors: [] }

  for (let index = 0; index < MAX_OFFERS_PER_EVENT_RUN; index += 1) {
    const { data: claimedId, error: claimError } = await supabase.rpc(
      'claim_next_event_waitlist_offer',
      { p_event_id: eventId, p_offer_minutes: OFFER_DURATION_MINUTES },
    )

    if (claimError) {
      result.errors.push(claimError.message)
      break
    }
    if (!claimedId || typeof claimedId !== 'string') break

    const { data: entry, error: entryError } = await supabase
      .from('event_waitlist_entries')
      .select('id, offer_token, offer_expires_at, participant_id, event_id')
      .eq('id', claimedId)
      .single()

    if (entryError || !entry?.offer_token || !entry.offer_expires_at) {
      result.errors.push(entryError?.message ?? `Niepełne dane oferty ${claimedId}`)
      break
    }

    const [{ data: participant }, { data: event }] = await Promise.all([
      supabase
        .from('participants')
        .select('owner_email, dog_name')
        .eq('id', entry.participant_id)
        .single(),
      supabase
        .from('events')
        .select('title, start_at, location')
        .eq('id', entry.event_id)
        .single(),
    ])

    if (!participant?.owner_email || !participant.dog_name || !event) {
      const message = 'Brakuje danych odbiorcy lub wydarzenia'
      await supabase
        .from('event_waitlist_entries')
        .update({
          status: 'waiting',
          offer_token: null,
          offered_at: null,
          offer_expires_at: null,
          last_error: message,
        })
        .eq('id', entry.id)
        .eq('status', 'offered')
      result.errors.push(`${entry.id}: ${message}`)
      break
    }

    try {
      const delivered = await sendEventWaitlistOfferEmail({
        to: participant.owner_email,
        dogName: participant.dog_name,
        eventTitle: event.title,
        eventDate: event.start_at,
        eventLocation: event.location,
        offerUrl: `${appUrl()}/waitlist/${entry.offer_token}`,
        expiresAt: entry.offer_expires_at,
      })
      if (!delivered) throw new Error('Wiadomość z propozycją miejsca nie została wysłana')
      result.offered += 1
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await supabase
        .from('event_waitlist_entries')
        .update({
          status: 'waiting',
          offer_token: null,
          offered_at: null,
          offer_expires_at: null,
          last_error: message.slice(0, 1000),
        })
        .eq('id', entry.id)
        .eq('status', 'offered')
      result.errors.push(`${entry.id}: ${message}`)
      break
    }
  }

  return result
}

export async function processAllEventWaitlists(): Promise<WaitlistProcessingResult> {
  const supabase = createServerClient()
  const { data: waiting, error } = await supabase
    .from('event_waitlist_entries')
    .select('event_id')
    .eq('status', 'waiting')
    .limit(1000)

  if (error) return { offered: 0, errors: [error.message] }

  const eventIds = [...new Set((waiting ?? []).map(entry => entry.event_id as string))]
  const total: WaitlistProcessingResult = { offered: 0, errors: [] }
  for (const eventId of eventIds) {
    const result = await processEventWaitlist(eventId)
    total.offered += result.offered
    total.errors.push(...result.errors.map(message => `${eventId}: ${message}`))
  }
  return total
}

export async function tryProcessEventWaitlist(eventId: string): Promise<void> {
  try {
    const result = await processEventWaitlist(eventId)
    if (result.errors.length > 0 && process.env.NODE_ENV === 'development') {
      console.error('[event-waitlist] Promotion errors:', result.errors)
    }
  } catch (error) {
    console.error('[event-waitlist] Promotion failed:', error)
  }
}
