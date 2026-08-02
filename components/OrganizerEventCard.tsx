'use client'

import Link from 'next/link'
import { Eye, LayoutDashboard } from 'lucide-react'
import EventCard from './EventCard'
import CancelEventButton from './CancelEventButton'
import RestoreEventButton from './RestoreEventButton'
import type { DogEvent } from '@/types'
import { effectiveStatus } from '@/lib/utils'

export default function OrganizerEventCard({
  event,
  registeredCount,
}: {
  event: DogEvent
  registeredCount?: number | null
}) {
  const displayStatus = effectiveStatus(event)
  const isDraft = displayStatus === 'draft'
  const workspaceHref = `/organizer/events/${event.slug}`

  return (
    <EventCard
      event={event}
      registeredCount={registeredCount}
      hidePublicActions
      extraActions={(
        <>
          <Link href={workspaceHref} className="btn btn-primary btn-sm">
            <LayoutDashboard className="h-3.5 w-3.5" />
            {isDraft ? 'Dokończ konfigurację' : 'Zarządzaj'}
          </Link>

          {!isDraft && (
            <Link
              href={displayStatus === 'finished' || displayStatus === 'cancelled'
                ? `/archive/${event.slug}`
                : `/events/${event.slug}`}
              className="btn btn-secondary btn-sm"
            >
              <Eye className="h-3.5 w-3.5" />
              Widok publiczny
            </Link>
          )}

          {!isDraft && (
            displayStatus !== 'cancelled'
              ? <CancelEventButton eventId={event.id} />
              : <RestoreEventButton eventId={event.id} />
          )}
        </>
      )}
    />
  )
}
