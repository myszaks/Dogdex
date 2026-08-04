import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { createServerClient } from '@/lib/supabaseServer'
import WaitlistOfferClient from './WaitlistOfferClient'

interface Props {
  params: Promise<{ token: string }>
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const metadata: Metadata = { title: 'Miejsce z listy rezerwowej' }
export const dynamic = 'force-dynamic'

export default async function WaitlistOfferPage({ params }: Props) {
  const { token } = await params
  if (!UUID_RE.test(token)) notFound()

  const supabase = createServerClient()
  const { data: entry } = await supabase
    .from('event_waitlist_entries')
    .select('event_id, participant_id, status, offer_expires_at')
    .eq('offer_token', token)
    .maybeSingle()
  if (!entry) notFound()

  const [{ data: event }, { data: participant }] = await Promise.all([
    supabase.from('events').select('title, slug, start_at, location').eq('id', entry.event_id).maybeSingle(),
    supabase.from('participants').select('dog_name').eq('id', entry.participant_id).maybeSingle(),
  ])
  if (!event || !participant) notFound()

  return (
    <WaitlistOfferClient
      token={token}
      initialStatus={entry.status}
      expiresAt={entry.offer_expires_at}
      event={event}
      dogName={participant.dog_name ?? 'Twój pies'}
    />
  )
}
