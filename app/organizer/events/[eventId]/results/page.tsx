import { createServerClient } from '@/lib/supabaseServer'
import { notFound } from 'next/navigation'
import ResultsForm from '@/components/ResultsForm'
import NextStartButton from '@/components/NextStartButton'
import Link from 'next/link'
import type { Metadata } from 'next'

interface Props {
  params: Promise<{ eventId: string }>
}

export const metadata: Metadata = { title: 'Wyniki' }

export default async function ResultsPage({ params }: Props) {
  const { eventId } = await params
  const supabase = createServerClient()

  const [{ data: event }, { data: registrations }, { data: results }] = await Promise.all([
    supabase.from('events').select('*').eq('id', eventId).single(),
    supabase
      .from('registrations')
      .select('id, participant_id, order_index, participants(id, dog_name, owner_name, dog_breed)')
      .eq('event_id', eventId)
      .eq('status', 'confirmed')
      .order('order_index', { ascending: true, nullsFirst: false }),
    supabase
      .from('results')
      .select('*')
      .eq('event_id', eventId),
  ])

  if (!event) notFound()
  if (!event.has_results) {
    return (
      <div>
        <h1 className="page-title">🏆 Wyniki</h1>
        <div className="card text-center py-12 text-slate-500">
          <p className="text-4xl mb-3">⚙️</p>
          <p className="font-semibold text-slate-700">Wyniki nie są włączone dla tego wydarzenia</p>
          <p className="text-sm mt-1">
            Włącz opcję <strong>Wyniki i ranking</strong> w ustawieniach wydarzenia.
          </p>
          <a href={`/organizer/events/${eventId}/edit`} className="btn btn-secondary btn-sm mt-4 inline-flex">
            ✏️ Edytuj wydarzenie
          </a>
        </div>
      </div>
    )
  }

  const participantsWithResults = (registrations ?? []).map((r: any) => ({
    id: r.participants?.id ?? r.participant_id,
    dog_name: r.participants?.dog_name ?? null,
    owner_name: r.participants?.owner_name ?? null,
    dog_breed: r.participants?.dog_breed ?? null,
    result: results?.find(res => res.participant_id === r.participant_id) ?? null,
  }))

  return (
    <div>
      <h1 className="page-title">🏆 Wyniki</h1>

      {/* Live control panel – only for ongoing events with ordered participants */}
      {event.status === 'ongoing' && (registrations?.length ?? 0) > 0 && (
        <div className="space-y-3 mb-5">
          <NextStartButton
            eventId={eventId}
            currentIndex={event.current_start_index ?? 0}
            totalCount={registrations?.length ?? 0}
          />
          <Link
            href={`/organizer/events/${eventId}/live-entry`}
            className="btn btn-primary w-full"
          >
            ⚡ Szybkie wprowadzanie wyników
          </Link>
        </div>
      )}

      <div className="card mb-5 bg-sky-50 border-sky-200">
        <p className="font-semibold text-sky-800">{event.title}</p>
        <p className="text-xs text-sky-600 mt-0.5">
          Tylko uczestnicy z potwierdzonym zapisem są widoczni poniżej.
        </p>
      </div>
      <ResultsForm eventId={eventId} participants={participantsWithResults} />
    </div>
  )
}
