import { createServerClient } from '@/lib/supabaseServer'
import { sendEventAnnouncementEmail } from '@/lib/email'

export interface AnnouncementDeliveryResult {
  processed: number
  delivered: number
  failed: number
  errors: string[]
}

interface ClaimedAnnouncementDelivery {
  id: string
  announcement_id: string
  recipient_email: string
  dog_names: string[] | null
  attempt_count: number
}

export async function processPendingAnnouncementDeliveries(options: {
  announcementId?: string
  limit?: number
} = {}): Promise<AnnouncementDeliveryResult> {
  const supabase = createServerClient()
  const limit = Math.min(Math.max(options.limit ?? 100, 1), 500)
  const staleBefore = new Date(Date.now() - 30 * 60 * 1000).toISOString()
  const { data, error } = await supabase.rpc('claim_event_announcement_deliveries', {
    p_announcement_id: options.announcementId ?? null,
    p_limit: limit,
    p_stale_before: staleBefore,
  })
  if (error) return { processed: 0, delivered: 0, failed: 0, errors: [error.message] }
  const deliveries = (data ?? []) as ClaimedAnnouncementDelivery[]
  if (!deliveries?.length) return { processed: 0, delivered: 0, failed: 0, errors: [] }

  const announcementIds = [...new Set(deliveries.map(delivery => delivery.announcement_id as string))]
  const { data: announcements, error: announcementsError } = await supabase
    .from('event_announcements')
    .select('id, event_id, title, body')
    .in('id', announcementIds)
  if (announcementsError) return { processed: 0, delivered: 0, failed: 0, errors: [announcementsError.message] }

  const eventIds = [...new Set((announcements ?? []).map(announcement => announcement.event_id as string))]
  const { data: events, error: eventsError } = await supabase
    .from('events')
    .select('id, title, slug')
    .in('id', eventIds)
  if (eventsError) return { processed: 0, delivered: 0, failed: 0, errors: [eventsError.message] }

  const announcementMap = new Map((announcements ?? []).map(announcement => [announcement.id as string, announcement]))
  const eventMap = new Map((events ?? []).map(event => [event.id as string, event]))
  const result: AnnouncementDeliveryResult = { processed: 0, delivered: 0, failed: 0, errors: [] }

  for (let index = 0; index < deliveries.length; index += 10) {
    const batch = deliveries.slice(index, index + 10)
    await Promise.all(batch.map(async delivery => {
      const announcement = announcementMap.get(delivery.announcement_id as string)
      const event = announcement ? eventMap.get(announcement.event_id as string) : null
      try {
        if (!announcement || !event) throw new Error('Brakuje komunikatu lub wydarzenia')
        const sent = await sendEventAnnouncementEmail({
          to: delivery.recipient_email,
          eventTitle: event.title,
          eventSlug: event.slug,
          announcementTitle: announcement.title,
          message: announcement.body,
          dogNames: Array.isArray(delivery.dog_names) ? delivery.dog_names : [],
        })
        if (!sent) throw new Error('Wiadomość nie została wysłana')
        await supabase
          .from('event_announcement_deliveries')
          .update({ status: 'sent', sent_at: new Date().toISOString(), claimed_at: null, error: null })
          .eq('id', delivery.id)
          .eq('status', 'pending')
        result.delivered += 1
      } catch (deliveryError) {
        const message = deliveryError instanceof Error ? deliveryError.message : String(deliveryError)
        const attemptCount = Number(delivery.attempt_count ?? 0)
        await supabase
          .from('event_announcement_deliveries')
          .update({
            status: attemptCount >= 3 ? 'failed' : 'pending',
            claimed_at: null,
            error: message.slice(0, 1000),
          })
          .eq('id', delivery.id)
          .eq('status', 'pending')
        if (attemptCount >= 3) result.failed += 1
        result.errors.push(`${delivery.id}: ${message}`)
      }
      result.processed += 1
    }))
  }

  for (const announcementId of announcementIds) {
    const [{ count: deliveredCount }, { count: failedCount }] = await Promise.all([
      supabase.from('event_announcement_deliveries').select('id', { count: 'exact', head: true })
        .eq('announcement_id', announcementId).eq('status', 'sent'),
      supabase.from('event_announcement_deliveries').select('id', { count: 'exact', head: true })
        .eq('announcement_id', announcementId).eq('status', 'failed'),
    ])
    await supabase.from('event_announcements').update({
      delivered_count: deliveredCount ?? 0,
      failed_count: failedCount ?? 0,
    }).eq('id', announcementId)
  }

  return result
}
