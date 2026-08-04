import { createAuthClient } from '@/lib/supabaseServer'
import { notFound } from 'next/navigation'
import { formatDate } from '@/lib/utils'
import CsvExportButton from '@/components/CsvExportButton'
import type { Metadata } from 'next'
import type { EventWaitlistEntry, FormField, Registration } from '@/types'
import type { CompetitionFormatDefinition } from '@/types/competition'
import OrganizerRegistrationsWorkspace from '@/components/OrganizerRegistrationsWorkspace'
import { cancellationRequestParticipant } from '@/lib/cancellationRequestParticipant'
import OrganizerWaitlistPanel from '@/components/OrganizerWaitlistPanel'

interface Props {
  params: Promise<{ eventId: string }>
}

export const metadata: Metadata = { title: 'Zapisy' }
export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function RegistrationsPage({ params }: Props) {
  const { eventId: param } = await params

  const supabase = await createAuthClient()

  const { data: event } = await supabase.from('events').select('*')
    .eq(UUID_RE.test(param) ? 'id' : 'slug', param).single()
  if (!event) notFound()
  const eventId = event.id

  const [
    { data: registrations },
    { data: cancellationRequests },
    { data: waitlistEntries },
  ] = await Promise.all([
    supabase
      .from('registrations')
      .select('*, participants(*)')
      .eq('event_id', eventId)
      .order('order_index', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true }),
    supabase
      .from('cancellation_requests')
      .select('*, registrations(participant_id, participants(dog_name, owner_name, owner_email))')
      .eq('event_id', eventId)
      .eq('status', 'pending')
      .order('created_at', { ascending: true }),
    supabase
      .from('event_waitlist_entries')
      .select('*, participants(*)')
      .eq('event_id', eventId)
      .in('status', ['waiting', 'offered'])
      .order('created_at', { ascending: true }),
  ])

  const eventFormFields: FormField[] = Array.isArray(event.form_fields) ? event.form_fields : []
  const participantByRegistrationId = new Map(
    (registrations ?? []).map(registration => [
      registration.id,
      cancellationRequestParticipant({ participants: registration.participants }),
    ]),
  )

  return (
    <div>
      <h2 className="page-title">Zapisy</h2>
      <div className="card mb-4 bg-sky-50 border-sky-200">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-semibold text-sky-800">{event.title}</p>
            {event.start_at && (
              <p className="text-sm text-sky-600 mt-0.5">📅 {formatDate(event.start_at)}</p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <CsvExportButton eventId={eventId} />
          </div>
        </div>
      </div>

      <OrganizerWaitlistPanel initialEntries={(waitlistEntries ?? []) as unknown as EventWaitlistEntry[]} />

      <OrganizerRegistrationsWorkspace
        initialRegistrations={(registrations ?? []) as unknown as Registration[]}
        initialCancellationRequests={(cancellationRequests ?? []).map(r => ({
          ...r,
          participant: cancellationRequestParticipant(r.registrations)
            ?? participantByRegistrationId.get(r.registration_id)
            ?? null,
        }))}
        eventFormFields={eventFormFields}
        groupingField={event.grouping_field ?? null}
        competitionDefinition={
          event.competition_config
          && typeof event.competition_config === 'object'
          && !Array.isArray(event.competition_config)
            ? event.competition_config as CompetitionFormatDefinition
            : null
        }
      />
    </div>
  )
}
