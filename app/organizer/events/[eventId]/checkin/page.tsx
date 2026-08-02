import { createAuthClient } from '@/lib/supabaseServer'
import { notFound } from 'next/navigation'
import {
  buildSpeedwayRegistrationContext,
  extractSizeClassFromRegistration,
  SIZE_CLASSES,
  SIZE_CLASS_LABELS,
} from '@/lib/speedway'
import { resolveCompetitionGroupValue } from '@/lib/competitionEngine'
import { configuredCompetitionGroupValues } from '@/lib/competitionViews'
import CheckInClient from '@/components/CheckInClient'
import type { CompetitionFormatDefinition } from '@/types/competition'
import type { Metadata } from 'next'

interface Props {
  params: Promise<{ eventId: string }>
}

export const metadata: Metadata = { title: 'Odprawa' }
export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function relatedRecord(value: unknown): Record<string, unknown> {
  const related = Array.isArray(value) ? value[0] : value
  return related && typeof related === 'object'
    ? related as Record<string, unknown>
    : {}
}

export default async function CheckInPage({ params }: Props) {
  const { eventId: param } = await params
  const supabase = await createAuthClient()

  const { data: event } = await supabase
    .from('events').select('id, slug, title, event_type_id, status, competition_config')
    .eq(UUID_RE.test(param) ? 'id' : 'slug', param).single()
  if (!event) notFound()
  const eventId = event.id

  const { data: registrations } = await supabase
    .from('registrations')
    .select('id, checked_in, form_data, participants(id, dog_name, owner_name, dogs(height_cm))')
    .eq('event_id', eventId)
    .eq('status', 'confirmed')
    .order('order_index', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true })

  const definition = (
    event.competition_config
    && typeof event.competition_config === 'object'
    && !Array.isArray(event.competition_config)
  ) ? event.competition_config as CompetitionFormatDefinition : null
  const heightGroup = definition?.groups.find(group =>
    group.source.op === 'ref'
    && group.source.path === 'registration.dog_height_cm'
    && Boolean(group.buckets?.length)
  )
  const configuredClasses = heightGroup
    ? configuredCompetitionGroupValues(heightGroup)
    : null
  const classOptions = configuredClasses ?? SIZE_CLASSES.map(sizeClass => ({
    key: sizeClass,
    label: SIZE_CLASS_LABELS[sizeClass],
  }))

  const participants = (registrations ?? []).map(r => {
    const participant = relatedRecord(r.participants)
    const dog = relatedRecord(participant.dogs)
    const pid = participant.id ?? r.id
    const dogHeightCm = dog.height_cm
    const formData = r.form_data as Record<string, unknown>
    const configuredClass = heightGroup
      ? resolveCompetitionGroupValue(heightGroup, {
          registration: {
            form_data: formData,
            ...buildSpeedwayRegistrationContext(
              formData,
              dogHeightCm,
              participant.dog_breed,
            ),
          },
        })
      : null
    const sizeClass = configuredClass
      ?? (heightGroup ? null : extractSizeClassFromRegistration(formData, dogHeightCm))
      ?? '__unassigned'
    return {
      registrationId: r.id as string,
      participantId: pid as string,
      dogName: (participant.dog_name ?? '') as string,
      ownerName: (participant.owner_name ?? '') as string,
      sizeClass,
      checkedIn: Boolean(r.checked_in),
    }
  })

  return (
    <div className="w-full">
      <div className="mb-6">
        <h2 className="page-title mb-0">Check-in</h2>
        <p className="mt-1 text-sm text-muted-foreground">Potwierdź obecność uczestników przed startem.</p>
      </div>

      <CheckInClient
        initialParticipants={participants}
        classOptions={classOptions}
        eventClosed={event.status === 'finished' || event.status === 'cancelled'}
      />
    </div>
  )
}
