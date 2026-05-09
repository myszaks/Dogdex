'use client'
import Link from 'next/link'
import EventCard from './EventCard'
import CancelEventButton from './CancelEventButton'
import RestoreEventButton from './RestoreEventButton'
import type { DogEvent } from '@/types'

export default function OrganizerEventCard({ event }: { event: DogEvent }) {
  return (
    <EventCard
      event={event}
      hidePublicActions
      extraActions={
        <>
          <Link
            href={`/organizer/events/${event.id}/registrations`}
            className="btn btn-secondary btn-sm"
          >
            👥 Zapisy
          </Link>
          {event.has_results && (
            <>
              <Link
                href={`/organizer/events/${event.id}/results`}
                className="btn btn-primary btn-sm"
              >
                🏆 Wyniki
              </Link>
              <Link
                href={`/live/${event.id}`}
                className="btn btn-secondary btn-sm"
              >
                🔴 Live
              </Link>
            </>
          )}
          <Link
            href={`/organizer/events/${event.id}/edit`}
            className="btn btn-secondary btn-sm"
          >
            ✏️ Edytuj
          </Link>
          <Link
            href={event.status === 'finished' || event.status === 'cancelled' ? `/archive/${event.slug ?? event.id}` : `/events/${event.slug ?? event.id}`}
            className="btn btn-secondary btn-sm"
          >
            Szczegóły
          </Link>
          {event.status !== 'cancelled'
            ? <CancelEventButton eventId={event.id} />
            : <RestoreEventButton eventId={event.id} />
          }
        </>
      }
    />
  )
}
