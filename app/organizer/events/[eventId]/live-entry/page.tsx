import { createAuthClient } from '@/lib/supabaseServer'
import { notFound, redirect } from 'next/navigation'
import { getEventAccess } from '@/lib/eventAccess'
import LiveEntryClient from './LiveEntryClient'
import type { Metadata } from 'next'

interface Props {
  params: Promise<{ eventId: string }>
}

export const metadata: Metadata = { title: 'Wprowadzanie wyników' }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function LiveEntryPage({ params }: Props) {
  const { eventId: param } = await params
  const access = await getEventAccess(param)
  if (!access?.can('results')) notFound()

  const supabase = await createAuthClient()

  const { data: event } = await supabase.from('events').select('*')
    .eq(UUID_RE.test(param) ? 'id' : 'slug', param).single()
  if (!event) notFound()
  if (!event.has_results) notFound()
  const eventId = event.id
  if (event.event_type_id === 'speedway') {
    redirect(`/organizer/events/${event.slug}/results`)
  }

  const [{ data: registrations }, { data: results }] = await Promise.all([
    supabase
      .from('registrations')
      .select('id, participant_id, order_index, participants(id, dog_name, owner_name, dog_breed)')
      .eq('event_id', eventId)
      .eq('status', 'confirmed')
      .order('order_index', { ascending: true, nullsFirst: false }),
    supabase
      .from('results')
      .select('id, participant_id, time_ms, notes')
      .eq('event_id', eventId),
  ])

  const currentIndex = event.current_start_index ?? 0

  const participants = (registrations ?? []).map((r: any) => ({
    id: (r.participants?.id ?? r.participant_id) as string,
    dog_name: (r.participants?.dog_name ?? null) as string | null,
    owner_name: (r.participants?.owner_name ?? null) as string | null,
    dog_breed: (r.participants?.dog_breed ?? null) as string | null,
    result:
      results?.find(
        res => res.participant_id === (r.participants?.id ?? r.participant_id)
      ) ?? null,
  }))

  const current = participants[currentIndex] ?? null
  const next = participants[currentIndex + 1] ?? null

  return (
    <div>
      <h2 className="page-title">Wprowadzanie na żywo</h2>

      <div className="card mb-4 bg-sky-50 border-sky-200">
        <p className="font-semibold text-sky-800">{event.title}</p>
        <p className="text-xs text-sky-600 mt-0.5">
          Potwierdzonych uczestników: {participants.length}
        </p>
      </div>

      <LiveEntryClient
        eventId={eventId}
        currentIndex={currentIndex}
        current={current}
        next={next}
        totalCount={participants.length}
      />
    </div>
  )
}
