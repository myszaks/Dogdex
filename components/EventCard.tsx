'use client'
import Link from 'next/link'
import Image from 'next/image'
import { formatDate, statusColor, statusLabel, isRegistrationOpen, effectiveStatus } from '@/lib/utils'
import RegisterModal from './RegisterModal'
import type { DogEvent, FormField } from '@/types'
import type { ReactNode } from 'react'

interface EventCardProps {
  event: DogEvent
  /** Render extra action buttons after the default ones */
  extraActions?: ReactNode
  /** Hide the public register/details/live buttons (e.g. organizer view) */
  hidePublicActions?: boolean
}

export default function EventCard({ event, extraActions, hidePublicActions }: EventCardProps) {
  const isOngoing = event.status === 'ongoing'
  const formFields: FormField[] = Array.isArray(event.form_fields) ? event.form_fields : []
  const regOpen = isRegistrationOpen(event)
  const dispStatus = effectiveStatus(event)

  return (
    <div className="card hover:shadow-md transition-shadow overflow-hidden p-0 flex flex-col">
      {event.image_url ? (
        <div className="relative w-full aspect-video shrink-0">
          <Image src={event.image_url} alt={event.title} fill className="object-cover" unoptimized />
          {isOngoing && (
            <div className="absolute top-2 left-2 flex items-center gap-1.5 bg-green-600/90 text-white text-xs font-semibold px-2 py-1 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse inline-block" />
              TRWA TERAZ
            </div>
          )}
        </div>
      ) : (
        <div className="relative w-full h-28 shrink-0 bg-gradient-to-br from-sky-100 to-blue-200 flex items-center justify-center text-4xl">
          🐾
          {isOngoing && (
            <div className="absolute top-2 left-2 flex items-center gap-1.5 bg-green-600/90 text-white text-xs font-semibold px-2 py-1 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse inline-block" />
              TRWA TERAZ
            </div>
          )}
        </div>
      )}
      <div className="p-4 flex flex-col flex-1">
        <div className="flex items-start justify-between gap-2">
          <h2 className="font-semibold text-lg text-slate-800 leading-tight">{event.title}</h2>
          <span className={`badge ${statusColor(dispStatus)} shrink-0`}>
            {statusLabel(dispStatus)}
          </span>
        </div>
        {event.organizer_name && (
          <p className="text-xs text-slate-400 mt-0.5">👤 {event.organizer_name}</p>
        )}
        {event.description && (
          <p className="text-slate-600 text-sm mt-1 line-clamp-2">{event.description}</p>
        )}
        <div className="mt-3 flex flex-wrap gap-3 text-sm text-slate-500">
          {event.start_at && <span>📅 {formatDate(event.start_at)}</span>}
          {event.location && <span>📍 {event.location}</span>}
          {event.registration_deadline && event.status === 'upcoming' && (
            <span className={regOpen ? 'text-slate-400' : 'text-orange-500 font-medium'}>
              {regOpen ? `⏳ Zapisy do ${formatDate(event.registration_deadline)}` : '🔒 Zapisy zamknięte'}
            </span>
          )}
        </div>
        <div className="mt-4 flex flex-wrap gap-2 mt-auto">
          {!hidePublicActions && (
            <>
              {event.status === 'upcoming' && regOpen && (
                <RegisterModal
                  eventId={event.id}
                  eventTitle={event.title}
                  formFields={formFields}
                />
              )}
              {event.status === 'upcoming' && !regOpen && (
                <span className="btn btn-sm bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200">
                  Zapisy zamknięte
                </span>
              )}
              {event.status === 'ongoing' && event.has_results && event.results_public && (
                <Link href={`/live/${event.id}`} className="btn btn-primary btn-sm">
                  🔴 Wyniki live
                </Link>
              )}
              <Link
                href={event.status === 'finished' || event.status === 'cancelled' ? `/archive/${event.slug ?? event.id}` : `/events/${event.slug ?? event.id}`}
                className="btn btn-secondary btn-sm"
              >
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
