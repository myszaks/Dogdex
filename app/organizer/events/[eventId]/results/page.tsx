import { createAuthClient } from '@/lib/supabaseServer'
import { notFound } from 'next/navigation'
import ResultsForm from '@/components/ResultsForm'
import SpeedwayLiveEntry from '@/components/SpeedwayLiveEntry'
import CompetitionResultEntry from '@/components/CompetitionResultEntry'
import type { SpeedwayLiveParticipant } from '@/components/SpeedwayLiveEntry'
import NextStartButton from '@/components/NextStartButton'
import PublishResultsButton from '@/components/PublishResultsButton'
import Link from 'next/link'
import type { Metadata } from 'next'
import { extractSizeClassFromRegistration } from '@/lib/speedway'
import { effectiveStatus } from '@/lib/utils'
import type { CompetitionFormatDefinition } from '@/types/competition'

interface Props {
  params: Promise<{ eventId: string }>
}

export const metadata: Metadata = { title: 'Wyniki' }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function relatedParticipant(value: unknown): Record<string, unknown> {
  const participant = Array.isArray(value) ? value[0] : value
  return typeof participant === 'object' && participant !== null
    ? participant as Record<string, unknown>
    : {}
}

export default async function ResultsPage({ params }: Props) {
  const { eventId: param } = await params
  const supabase = await createAuthClient()

  const { data: event } = await supabase.from('events').select('*')
    .eq(UUID_RE.test(param) ? 'id' : 'slug', param).single()
  if (!event) notFound()
  const eventId = event.id

  const [{ data: registrations }, { data: results }] = await Promise.all([
    supabase
      .from('registrations')
      .select('id, participant_id, order_index, form_data, checked_in, participants(id, dog_name, owner_name, dog_breed, dogs(height_cm))')
      .eq('event_id', eventId)
      .eq('status', 'confirmed')
      .order('order_index', { ascending: true, nullsFirst: false }),
    supabase
      .from('results')
      .select('*')
      .eq('event_id', eventId),
  ])
  if (!event.has_results) {
    return (
      <div>
        <h2 className="page-title">Wyniki</h2>
        <div className="card text-center py-12 text-slate-500">
          <p className="text-4xl mb-3">⚙️</p>
          <p className="font-semibold text-slate-700">Wyniki nie są włączone dla tego wydarzenia</p>
          <p className="text-sm mt-1">
            Włącz opcję <strong>Wyniki i ranking</strong> w ustawieniach wydarzenia.
          </p>
          <a href={`/organizer/events/${event.slug}/edit`} className="btn btn-secondary btn-sm mt-4 inline-flex">
            ✏️ Edytuj wydarzenie
          </a>
        </div>
      </div>
    )
  }

  const isSpeedway = event.event_type_id === 'speedway'
  const checkedInSpeedwayParticipantIds = new Set(
    isSpeedway
      ? (registrations ?? [])
          .filter((r: any) => Boolean(r.checked_in))
          .map((r: any) => r.participant_id as string)
      : []
  )
  const speedwayResults = isSpeedway
    ? (results ?? []).filter((res: any) => checkedInSpeedwayParticipantIds.has(res.participant_id as string))
    : (results ?? [])

  const participantsWithResults = (registrations ?? []).map((r: any) => ({
    id: r.participants?.id ?? r.participant_id,
    dog_name: r.participants?.dog_name ?? null,
    owner_name: r.participants?.owner_name ?? null,
    dog_breed: r.participants?.dog_breed ?? null,
    result: results?.find(res => res.participant_id === r.participant_id) ?? null,
  }))

  const speedwayParticipants: SpeedwayLiveParticipant[] = (registrations ?? []).map((r: any) => {
    const existingResult = speedwayResults.find(res => res.participant_id === r.participant_id) ?? null
    const dogHeightCm = Array.isArray(r.participants?.dogs)
      ? r.participants.dogs[0]?.height_cm
      : r.participants?.dogs?.height_cm
    return {
      participantId: r.participants?.id ?? r.participant_id,
      dogName: r.participants?.dog_name ?? '',
      ownerName: r.participants?.owner_name ?? '',
      breed: r.participants?.dog_breed ?? '',
      heightCm: dogHeightCm ?? null,
      formSizeClass: extractSizeClassFromRegistration(r.form_data as Record<string, unknown>, dogHeightCm) ?? null,
      checkedIn: Boolean(r.checked_in),
      result: existingResult ? {
        id: existingResult.id,
        run1_ms: existingResult.run1_ms ?? null,
        run2_ms: existingResult.run2_ms ?? null,
        run1_status: (existingResult.run1_status as 'DNS' | 'DNF' | null) ?? null,
        run2_status: (existingResult.run2_status as 'DNS' | 'DNF' | null) ?? null,
        best_ms: existingResult.best_ms ?? null,
        speed_kmh: existingResult.speed_kmh ?? null,
        size_class: existingResult.size_class ?? null,
        class_rank: existingResult.class_rank ?? null,
      } : null,
    }
  })
  const competitionDefinition = event.competition_config as CompetitionFormatDefinition | null
  const { data: competitionEntries } = competitionDefinition
    ? await supabase
        .from('competition_result_entries')
        .select('id, participant_id, stage_id, attempt_id, status, values')
        .eq('event_id', eventId)
    : { data: [] }
  const competitionParticipants = (registrations ?? [])
    .filter(registration => !isSpeedway || Boolean(registration.checked_in))
    .map(registration => {
      const participant = relatedParticipant(registration.participants)
      return {
        participantId: typeof participant.id === 'string'
          ? participant.id
          : String(registration.participant_id),
        dogName: typeof participant.dog_name === 'string' ? participant.dog_name : '',
        ownerName: typeof participant.owner_name === 'string' ? participant.owner_name : '',
      }
    })

  return (
    <div>
      <h2 className="page-title">Wyniki</h2>

      {/* Live control panel – only for ongoing events with ordered participants */}
      {effectiveStatus(event) === 'ongoing' && !isSpeedway && !competitionDefinition && (registrations?.length ?? 0) > 0 && (
        <div className="space-y-3 mb-5">
          <NextStartButton
            eventId={eventId}
            currentIndex={event.current_start_index ?? 0}
            totalCount={registrations?.length ?? 0}
          />
          <Link
            href={`/organizer/events/${event.slug}/live-entry`}
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

      <PublishResultsButton eventId={eventId} resultsPublic={!!event.results_public} />

      {competitionDefinition ? (
        <CompetitionResultEntry
          eventId={eventId}
          definition={competitionDefinition}
          participants={competitionParticipants}
          initialEntries={competitionEntries ?? []}
        />
      ) : isSpeedway ? (
        <SpeedwayLiveEntry
          eventId={eventId}
          eventSlug={event.slug}
          initialEventStatus={event.status}
          initialLivePhase={event.live_phase ?? null}
          initialTrackDistanceM={event.track_distance_m ?? null}
          participants={speedwayParticipants}
        />
      ) : (
        <ResultsForm eventId={eventId} participants={participantsWithResults} />
      )}
    </div>
  )
}
