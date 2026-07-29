'use client'

import Link from 'next/link'
import EventCard from './EventCard'
import CancelEventButton from './CancelEventButton'
import RestoreEventButton from './RestoreEventButton'
import type { DogEvent } from '@/types'
import { Users, Calendar, Trophy, Radio, Pencil, Eye, ClipboardCheck, FileText } from 'lucide-react'
import { effectiveStatus } from '@/lib/utils'

export default function OrganizerEventCard({
  event,
  registeredCount,
}: {
  event: DogEvent
  registeredCount?: number | null
}) {
  const dispStatus = effectiveStatus(event)
  const eid = event.slug
  const isDraft = dispStatus === 'draft'
  const editDisabled = dispStatus === 'ongoing' || dispStatus === 'finished'

  return (
    <EventCard
      event={event}
      registeredCount={registeredCount}
      hidePublicActions
      extraActions={
        <>
          {isDraft ? (
            <span className="btn btn-sm bg-secondary text-muted-foreground border border-border cursor-default">
              <FileText className="w-3.5 h-3.5" />
              Szkic
            </span>
          ) : (
            <>
              <Link href={`/organizer/events/${eid}/registrations`} className="btn btn-secondary btn-sm">
                <Users className="w-3.5 h-3.5" />
                Zapisy
              </Link>
              {event.event_type_id === 'speedway' && (
                <Link href={`/organizer/events/${eid}/checkin`} className="btn btn-secondary btn-sm">
                  <ClipboardCheck className="w-3.5 h-3.5" />
                  Odprawa
                </Link>
              )}
              {event.has_schedule && (
                <Link href={`/organizer/events/${eid}/schedule`} className="btn btn-secondary btn-sm">
                  <Calendar className="w-3.5 h-3.5" />
                  Grafik
                </Link>
              )}
              {event.has_results && (
                <>
                  <Link href={`/organizer/events/${eid}/results`} className="btn btn-primary btn-sm">
                    <Trophy className="w-3.5 h-3.5" />
                    Wyniki
                  </Link>
                  <Link href={`/live/${eid}`} className="btn btn-secondary btn-sm">
                    <Radio className="w-3.5 h-3.5" />
                    Na żywo
                  </Link>
                </>
              )}
            </>
          )}

          {editDisabled ? (
            <button
              type="button"
              disabled
              title="Edycja jest niedostępna po rozpoczęciu wydarzenia"
              className="btn btn-secondary btn-sm opacity-50 cursor-not-allowed"
            >
              <Pencil className="w-3.5 h-3.5" />
              Edytuj
            </button>
          ) : (
            <Link href={`/organizer/events/${eid}/edit`} className="btn btn-secondary btn-sm">
              <Pencil className="w-3.5 h-3.5" />
              Edytuj
            </Link>
          )}

          {!isDraft && (
            <>
              <Link
                href={dispStatus === 'finished' || dispStatus === 'cancelled' ? `/archive/${event.slug}` : `/events/${event.slug}`}
                className="btn btn-secondary btn-sm"
              >
                <Eye className="w-3.5 h-3.5" />
                Szczegóły
              </Link>
              {dispStatus !== 'cancelled'
                ? <CancelEventButton eventId={event.id} />
                : <RestoreEventButton eventId={event.id} />
              }
            </>
          )}
        </>
      }
    />
  )
}
