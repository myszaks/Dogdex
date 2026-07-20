'use client'
import Link from 'next/link'
import Image from 'next/image'
import { formatDate, statusColor, statusLabel, isRegistrationOpen, registrationPhase, effectiveStatus } from '@/lib/utils'
import RegisterModal from './RegisterModal'
import type { DogEvent, FormField } from '@/types'
import type { ReactNode } from 'react'
import { MapPin, Clock, User, Radio, Lock, PawPrint } from 'lucide-react'
import { cn } from '@/lib/utils'

interface EventCardProps {
  event: DogEvent
  registeredCount?: number | null
  extraActions?: ReactNode
  hidePublicActions?: boolean
}

function statusBadgeClasses(status: string) {
  const map: Record<string, string> = {
    upcoming: 'bg-blue-100 text-blue-700',
    upcoming_closed: 'bg-amber-100 text-amber-700',
    ongoing: 'bg-emerald-100 text-emerald-700',
    finished: 'bg-secondary text-muted-foreground',
    cancelled: 'bg-red-100 text-red-700',
  }
  return map[status] ?? 'bg-secondary text-muted-foreground'
}

export default function EventCard({ event, registeredCount, extraActions, hidePublicActions }: EventCardProps) {
  const dispStatus = effectiveStatus(event)
  const isOngoing = dispStatus === 'ongoing'
  const formFields: FormField[] = Array.isArray(event.form_fields) ? event.form_fields : []
  const regOpen = isRegistrationOpen(event)
  const regPhase = registrationPhase(event)
  const maxParticipants = typeof event.max_participants === 'number' ? event.max_participants : null
  const capacityKnown = typeof registeredCount === 'number'
  const isFull = capacityKnown && maxParticipants !== null && maxParticipants > 0 && registeredCount >= maxParticipants
  const detailHref = dispStatus === 'finished' || dispStatus === 'cancelled'
    ? `/archive/${event.slug}`
    : `/events/${event.slug}`

  return (
    <div className="bg-card rounded-3xl border border-border shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden flex flex-col group">
      {/* Image / Placeholder */}
      <div className="relative w-full aspect-video shrink-0 overflow-hidden">
        {event.image_url ? (
          <Image
            src={event.image_url}
            alt={event.title}
            fill
            className="object-cover group-hover:scale-105 transition-transform duration-300"
            unoptimized
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-[#1E3932]/10 to-[#1E3932]/5 flex items-center justify-center">
            <span className="text-5xl opacity-30">🐾</span>
          </div>
        )}
        {/* Change warning */}
        {event.last_significant_change &&
          Array.isArray(event.changed_fields) &&
          event.changed_fields.some((f: string) => ['start_at', 'end_at', 'location'].includes(f)) &&
          Date.now() - new Date(event.last_significant_change).getTime() < 7 * 24 * 60 * 60 * 1000 && (
            <div className="absolute top-3 right-3">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-orange-100 text-orange-700 backdrop-blur-sm">
                ⚠️ Zmiana
              </span>
            </div>
          )}
      </div>

      {/* Content */}
      <div className="p-5 flex flex-col flex-1">
        <div className="flex-1">
          <h2 className="font-heading font-bold text-base text-foreground leading-tight mb-1 wrap-anywhere">
            {event.title}
          </h2>
          {event.organizer_name && (
            <p className="text-xs text-muted-foreground flex items-center gap-1 mb-2">
              <User className="w-3 h-3" />
              {event.organizer_name}
            </p>
          )}
          {event.description && (
            <p className="text-sm text-muted-foreground line-clamp-2 mb-3 wrap-anywhere">{event.description}</p>
          )}
          <div className="flex flex-col gap-1">
            {event.start_at && (
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 shrink-0 text-accent" />
                <span className="wrap-anywhere">
                  {formatDate(event.start_at)}
                  {event.end_at && <> - {formatDate(event.end_at)}</>}
                </span>
              </p>
            )}
            {event.location && (
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 shrink-0 text-accent" />
                <span className="wrap-anywhere">{event.location}</span>
              </p>
            )}
            {maxParticipants !== null && capacityKnown && (
              <p className={cn('text-xs flex items-center gap-1.5', isFull ? 'text-red-600 font-medium' : 'text-muted-foreground')}>
                <PawPrint className="w-3.5 h-3.5 shrink-0" />
                {isFull ? 'Brak wolnych miejsc' : `${registeredCount} / ${maxParticipants} miejsc`}
              </p>
            )}
            {event.registration_opens_at && regPhase === 'not_started' && (
              <p className="text-xs flex items-center gap-1.5 text-muted-foreground font-medium">
                <Lock className="w-3.5 h-3.5 shrink-0" />
                Zapisy od {formatDate(event.registration_opens_at)}
              </p>
            )}
            {event.registration_deadline && dispStatus === 'upcoming' && regPhase !== 'not_started' && (
              <p className={cn('text-xs flex items-center gap-1.5', regOpen ? 'text-muted-foreground' : 'text-orange-600 font-medium')}>
                <Lock className="w-3.5 h-3.5 shrink-0" />
                {regOpen ? `Zapisy do ${formatDate(event.registration_deadline)}` : 'Zapisy zamknięte'}
              </p>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="mt-4 flex flex-wrap gap-2">
          {!hidePublicActions && (
            <>
              {dispStatus === 'upcoming' && regOpen && !isFull && (
                <RegisterModal eventId={event.id} eventTitle={event.title} formFields={formFields} />
              )}
              {dispStatus === 'upcoming' && regOpen && isFull && (
                <span className="btn btn-sm bg-secondary text-muted-foreground border border-border cursor-not-allowed">
                  Brak miejsc
                </span>
              )}
              {dispStatus === 'upcoming' && regPhase === 'not_started' && event.registration_opens_at && (
                <button
                  type="button"
                  disabled
                  className="btn btn-sm bg-secondary text-muted-foreground border border-border cursor-not-allowed"
                >
                  Zapisy od {formatDate(event.registration_opens_at)}
                </button>
              )}
              {dispStatus === 'upcoming' && regPhase === 'closed' && (
                <span className="btn btn-sm bg-secondary text-muted-foreground border border-border cursor-not-allowed">
                  Zapisy zamknięte
                </span>
              )}
              {dispStatus === 'ongoing' && event.has_results && event.results_public && (
                <Link href={`/live/${event.slug}`} className="btn btn-primary btn-sm">
                  <Radio className="w-3.5 h-3.5" />
                  Wyniki live
                </Link>
              )}
              <Link href={detailHref} className="btn btn-secondary btn-sm">
                Szczegóły
              </Link>
            </>
          )}
          {extraActions}
        </div>
      </div>
    </div>
  )
}
