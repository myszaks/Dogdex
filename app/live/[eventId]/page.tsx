import { createServerClient } from '@/lib/supabaseServer'
import { notFound } from 'next/navigation'
import LiveResults from '@/components/LiveResults'
import LiveStartPanel from '@/components/LiveStartPanel'
import SpeedwayLiveView from '@/components/SpeedwayLiveView'
import type { SpeedwayLiveParticipantInfo } from '@/components/SpeedwayLiveView'
import { getSizeClass, extractSizeClassFromFormData } from '@/lib/speedway'
import { formatDate } from '@/lib/utils'
import Link from 'next/link'
import type { Metadata } from 'next'

interface Props {
  params: Promise<{ eventId: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { eventId } = await params
  const supabase = createServerClient()
  const { data } = await supabase.from('events').select('title').eq('id', eventId).single()
  return { title: `Live – ${data?.title ?? 'Wydarzenie'}` }
}

export default async function LivePage({ params }: Props) {
  const { eventId } = await params
  const supabase = createServerClient()

  const [{ data: event }, { data: results }, { data: registrations }] = await Promise.all([
    supabase.from('events').select('*').eq('id', eventId).single(),
    supabase
      .from('results')
      .select('*, participants(dog_name, owner_name, dog_breed)')
      .eq('event_id', eventId)
      .order('rank', { ascending: true }),
    supabase
      .from('registrations')
      .select('id, order_index, form_data, participants(id, dog_name, owner_name, dog_breed)')
      .eq('event_id', eventId)
      .eq('status', 'confirmed')
      .order('order_index', { ascending: true, nullsFirst: false }),
  ])

  if (!event) notFound()
  if (!event.has_results) notFound()

  const isPublic = event.results_public ?? true
  const isSpeedway = event.event_type_id === 'speedway'

  const startParticipants = (registrations ?? []).map((r: any) => ({
    registration_id: r.id as string,
    dog_name: r.participants?.dog_name ?? null,
    owner_name: r.participants?.owner_name ?? null,
    dog_breed: r.participants?.dog_breed ?? null,
  }))

  const speedwayParticipants: SpeedwayLiveParticipantInfo[] = (registrations ?? []).map((r: any) => {
    const pid = r.participants?.id ?? r.id
    const existingResult = (results ?? []).find((res: any) => res.participant_id === pid)
    const formClass = extractSizeClassFromFormData(r.form_data as Record<string, unknown>)
    const existingClass = existingResult?.size_class && ['XS','S','M','L','XL'].includes(existingResult.size_class)
      ? existingResult.size_class as import('@/lib/speedway').SizeClass
      : null
    const sizeClass: import('@/lib/speedway').SizeClass = formClass ?? existingClass ?? 'M'
    return {
      participantId: pid,
      dogName: r.participants?.dog_name ?? null,
      ownerName: r.participants?.owner_name ?? null,
      sizeClass,
    }
  })

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span className="w-3 h-3 rounded-full bg-red-500 animate-pulse inline-block" />
        <span className="text-red-600 font-semibold text-sm uppercase tracking-wide">
          Na żywo
        </span>
      </div>
      <h1 className="text-2xl font-bold text-slate-800 mb-1">{event.title}</h1>
      {event.start_at && (
        <p className="text-slate-500 text-sm mb-5">📅 {formatDate(event.start_at)}</p>
      )}

      {isPublic ? (
        <>
          {isSpeedway ? (
            <SpeedwayLiveView
              eventId={eventId}
              initialStartIndex={event.current_start_index ?? 0}
              initialLivePhase={event.live_phase ?? null}
              participants={speedwayParticipants}
              initialResults={results ?? []}
            />
          ) : (
            <>
              <LiveStartPanel
                eventId={eventId}
                initialStartIndex={event.current_start_index ?? 0}
                participants={startParticipants}
              />
              <LiveResults eventId={eventId} initialResults={results ?? []} />
            </>
          )}
        </>
      ) : (
        <div className="card text-center py-12 text-slate-500">
          <p className="text-4xl mb-3">🔒</p>
          <p className="font-semibold text-slate-700">Wyniki nie są jeszcze publiczne</p>
          <p className="text-sm mt-1">Organizator opublikuje je wkrótce.</p>
        </div>
      )}

      <div className="mt-6 text-center">
        <Link href="/" className="text-sm text-slate-400 hover:text-sky-600 transition-colors">
          ← Powrót do strony głównej
        </Link>
      </div>
    </div>
  )
}
