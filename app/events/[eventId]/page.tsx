import { createServerClient } from '@/lib/supabaseServer'
import { notFound, redirect } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import {
  formatDate,
  isRegistrationOpen,
  effectiveStatus,
  statusLabel,
  statusColor,
} from '@/lib/utils'
import RegisterModal from '@/components/RegisterModal'
import type { Metadata } from 'next'
import type { FormField } from '@/types'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function resolveEvent(param: string) {
  const supabase = createServerClient()
  // Try slug first
  const { data: bySlug } = await supabase.from('events').select('*').eq('slug', param).maybeSingle()
  if (bySlug) return { event: bySlug, redirectTo: null }
  // Fallback: UUID
  if (UUID_RE.test(param)) {
    const { data: byId } = await supabase.from('events').select('*').eq('id', param).maybeSingle()
    if (byId) {
      // Redirect to canonical slug URL if one exists
      const target = byId.slug ? `/events/${byId.slug}` : null
      return { event: byId, redirectTo: target }
    }
  }
  return { event: null, redirectTo: null }
}

interface Props {
  params: Promise<{ eventId: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { eventId } = await params
  const { event } = await resolveEvent(eventId)
  return { title: event?.title ?? 'Wydarzenie' }
}

export const revalidate = 60

export default async function EventDetailPage({ params }: Props) {
  const { eventId } = await params
  const { event, redirectTo } = await resolveEvent(eventId)
  if (!event) notFound()
  if (redirectTo) redirect(redirectTo)

  const formFields: FormField[] = Array.isArray(event.form_fields) ? event.form_fields : []
  const regOpen = isRegistrationOpen(event)
  const dispStatus = effectiveStatus(event)
  const isOngoing = event.status === 'ongoing'
  const mapsQuery = event.location ? encodeURIComponent(event.location) : null

  return (
    <div>
      {/* Back link */}
      <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-sky-600 mb-5 transition-colors">
        ← Powrót do wydarzeń
      </Link>

      {/* Hero */}
      {event.image_url ? (
        <div className="relative w-full aspect-[3/1] rounded-2xl overflow-hidden mb-6 shadow">
          <Image src={event.image_url} alt={event.title} fill className="object-cover" unoptimized />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
          <div className="absolute bottom-0 left-0 p-5">
            <h1 className="text-2xl sm:text-3xl font-bold text-white leading-tight drop-shadow">
              {event.title}
            </h1>
            {isOngoing && (
              <span className="mt-2 inline-flex items-center gap-1.5 bg-green-600/90 text-white text-xs font-semibold px-2.5 py-1 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse inline-block" />
                TRWA TERAZ
              </span>
            )}
          </div>
        </div>
      ) : (
        <div className="relative w-full h-40 rounded-2xl overflow-hidden mb-6 bg-gradient-to-br from-sky-100 to-blue-200 flex items-center justify-center">
          <span className="text-7xl">🐾</span>
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
          <div className="absolute bottom-0 left-0 p-5">
            <h1 className="text-2xl sm:text-3xl font-bold text-white leading-tight drop-shadow">
              {event.title}
            </h1>
            {isOngoing && (
              <span className="mt-2 inline-flex items-center gap-1.5 bg-green-600/90 text-white text-xs font-semibold px-2.5 py-1 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse inline-block" />
                TRWA TERAZ
              </span>
            )}
          </div>
        </div>
      )}

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Left: details + map */}
        <div className="lg:col-span-2 space-y-5">

          {/* Info card */}
          <div className="card space-y-4">
            <div className="flex items-center gap-3 flex-wrap">
              <span className={`badge ${statusColor(dispStatus)} text-sm`}>
                {statusLabel(dispStatus)}
              </span>
              {event.organizer_name && (
                <span className="text-sm text-slate-500">👤 {event.organizer_name}</span>
              )}
            </div>

            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
              {event.start_at && (
                <div>
                  <dt className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-0.5">Początek</dt>
                  <dd className="text-slate-800 font-medium">📅 {formatDate(event.start_at)}</dd>
                </div>
              )}
              {event.end_at && (
                <div>
                  <dt className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-0.5">Koniec</dt>
                  <dd className="text-slate-700">📅 {formatDate(event.end_at)}</dd>
                </div>
              )}
              {event.location && (
                <div className="sm:col-span-2">
                  <dt className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-0.5">Lokalizacja</dt>
                  <dd className="text-slate-800 font-medium">📍 {event.location}</dd>
                </div>
              )}
            </dl>

            {event.description && (
              <div className="border-t border-slate-100 pt-4">
                <p className="text-slate-700 leading-relaxed whitespace-pre-line">{event.description}</p>
              </div>
            )}
          </div>

          {/* Google Maps */}
          {mapsQuery && (
            <div className="card p-0 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100">
                <h2 className="text-sm font-semibold text-slate-700">📍 Mapa dojazdu</h2>
              </div>
              <iframe
                title="Mapa lokalizacji"
                src={`https://maps.google.com/maps?q=${mapsQuery}&output=embed&hl=pl`}
                className="w-full h-64 sm:h-80 border-0"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            </div>
          )}
        </div>

        {/* Right: action sidebar */}
        <div className="space-y-4">

          {/* Registration card */}
          <div className="card">
            <h2 className="font-semibold text-slate-800 mb-3">Zapisy</h2>

            {event.status === 'upcoming' && regOpen && (
              <>
                {event.registration_deadline && (
                  <p className="text-sm text-slate-500 mb-3">
                    ⏳ Zapisy otwarte do<br />
                    <span className="font-medium text-slate-700">{formatDate(event.registration_deadline)}</span>
                  </p>
                )}
                {event.max_participants != null && (
                  <p className="text-xs text-slate-400 mb-3">
                    Limit uczestników: {event.max_participants}
                  </p>
                )}
                <RegisterModal
                  eventId={event.id}
                  eventTitle={event.title}
                  formFields={formFields}
                />
              </>
            )}

            {event.status === 'upcoming' && !regOpen && (
              <p className="text-sm text-orange-600 font-medium">
                🔒 Zapisy zostały zamknięte
                {event.registration_deadline && (
                  <><br /><span className="text-slate-400 font-normal text-xs">{formatDate(event.registration_deadline)}</span></>
                )}
              </p>
            )}

            {event.status === 'ongoing' && (
              <p className="text-sm text-green-700 font-medium">✅ Wydarzenie jest w trakcie</p>
            )}
          </div>

          {/* Live results button */}
          {event.status === 'ongoing' && event.has_results && event.results_public && (
            <Link href={`/live/${event.id}`} className="btn btn-primary w-full">
              🔴 Wyniki live
            </Link>
          )}

          {/* Organizer info */}
          {event.organizer_name && (
            <div className="card bg-slate-50">
              <p className="text-xs text-slate-400 uppercase tracking-wide font-medium mb-1">Organizator</p>
              <p className="text-slate-700 font-medium">{event.organizer_name}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
