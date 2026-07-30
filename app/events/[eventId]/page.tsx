import { createServerClient } from '@/lib/supabaseServer'
import { notFound, redirect } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import {
  formatDate,
  isRegistrationOpen,
  effectiveStatus,
  statusLabel,
  statusBadgeClasses,
} from '@/lib/utils'
import { formatPolishCount, POLISH_FORMS } from '@/lib/polish'
import RegisterModal from '@/components/RegisterModal'
import UserRegistrationStatus from '@/components/UserRegistrationStatus'
import EventMapClient from '@/components/EventMapClient'
import type { Metadata } from 'next'
import type { FormField } from '@/types'
import { ArrowLeft, MapPin, CalendarDays, Clock, Radio, Trophy, User, ImageIcon, Lock, PawPrint, ChevronRight, Banknote } from 'lucide-react'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function resolveEvent(param: string) {
  const supabase = createServerClient()
  const { data: bySlug } = await supabase.from('events').select('*').eq('slug', param).maybeSingle()
  if (bySlug) return { event: bySlug, redirectTo: null }
  if (UUID_RE.test(param)) {
    const { data: byId } = await supabase.from('events').select('*').eq('id', param).maybeSingle()
    if (byId) {
      const target = `/events/${byId.slug}`
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
  if (!event || event.status === 'draft') return { title: 'Wydarzenie' }

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://dogdex.pl'
  const canonicalUrl = `${baseUrl}/events/${event.slug}`
  const description = event.description
    ? event.description.slice(0, 200).replace(/\s+/g, ' ').trim()
    : `Wydarzenie psie: ${event.title}${event.location ? ` – ${event.location}` : ''}`

  const images = event.image_url
    ? [{ url: event.image_url, width: 1200, height: 630, alt: event.title }]
    : [{ url: `${baseUrl}/og-default.jpg`, width: 1200, height: 630, alt: 'Dogdex' }]

  return {
    title: event.title,
    description,
    openGraph: {
      title: event.title,
      description,
      url: canonicalUrl,
      siteName: 'Dogdex',
      locale: 'pl_PL',
      type: 'website',
      images,
    },
    twitter: {
      card: 'summary_large_image',
      title: event.title,
      description,
      images: images.map(i => i.url),
    },
    alternates: {
      canonical: canonicalUrl,
    },
  }
}

export const dynamic = 'force-dynamic'

export default async function EventDetailPage({ params }: Props) {
  const { eventId } = await params
  const { event, redirectTo } = await resolveEvent(eventId)
  if (!event) notFound()
  if (event.status === 'draft') notFound()
  if (redirectTo) redirect(redirectTo)

  const supabase = createServerClient()
  const [{ count: slotCount }, { count: regCount }] = await Promise.all([
    supabase.from('time_slots').select('id', { count: 'exact', head: true }).eq('event_id', event.id),
    supabase.from('registrations').select('id', { count: 'exact', head: true }).eq('event_id', event.id).in('status', ['pending', 'confirmed']),
  ])

  const formFields: FormField[] = Array.isArray(event.form_fields) ? event.form_fields : []
  const dispStatus = effectiveStatus(event)
  const regOpen = isRegistrationOpen(event)
  const isOngoing = dispStatus === 'ongoing'
  const mapsQuery = event.location ? encodeURIComponent(event.location) : null
  const hasSchedule = (slotCount ?? 0) > 0

  // Days remaining to registration deadline or event start
  const now = new Date()
  const deadlineDate = event.registration_deadline ? new Date(event.registration_deadline) : null
  const startDate = event.start_at ? new Date(event.start_at) : null
  const targetDate = deadlineDate && deadlineDate > now ? deadlineDate : startDate
  const daysRemaining = dispStatus === 'upcoming' && targetDate
    ? Math.ceil((targetDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    : null

  const registeredCount = regCount ?? 0
  const maxParticipants = event.max_participants
  const isFull = typeof maxParticipants === 'number' && maxParticipants > 0 && registeredCount >= maxParticipants
  const fillPct = maxParticipants && maxParticipants > 0
    ? Math.min(100, Math.round((registeredCount / maxParticipants) * 100))
    : null

  const statusDotColor: Record<string, string> = {
    upcoming: 'bg-blue-400',
    ongoing: 'bg-emerald-500',
    finished: 'bg-muted-foreground',
    cancelled: 'bg-red-500',
  }

  return (
    <div className="max-w-6xl mx-auto">
      {/* Back link */}
      <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-5 transition-colors">
        <ArrowLeft className="w-4 h-4" />
        Powrót do wydarzeń
      </Link>

      {/* ── Hero ───────────────────────────────────────────────── */}
      <div className="relative w-full aspect-[21/8] min-h-[220px] rounded-3xl overflow-hidden mb-8 shadow-lg">
        {event.image_url ? (
          <Image
            src={event.image_url}
            alt={event.title}
            fill
            className="object-cover"
            unoptimized
            loading="eager"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-primary/30 to-primary/10 flex items-center justify-center">
            <ImageIcon className="w-20 h-20 text-primary/20" />
          </div>
        )}

        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />

        {/* Bottom: title + meta + CTA */}
        <div className="absolute bottom-0 left-0 right-0 p-6 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-heading font-bold text-white leading-tight drop-shadow mb-2 wrap-anywhere">
              {event.title}
            </h1>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-white/80 text-sm">
              {event.start_at && (
                <span className="flex items-center gap-1.5 min-w-0">
                  <CalendarDays className="w-3.5 h-3.5 shrink-0" />
                  <span className="wrap-anywhere">
                    {formatDate(event.start_at)}
                    {event.end_at && <> - {formatDate(event.end_at)}</>}
                  </span>
                </span>
              )}
              {event.location && (
                <span className="flex items-center gap-1.5 min-w-0">
                  <MapPin className="w-3.5 h-3.5 shrink-0" />
                  <span className="wrap-anywhere">{event.location}</span>
                </span>
              )}
              {event.organizer_name && (
                <span className="flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 shrink-0" />
                  {event.organizer_name}
                </span>
              )}
            </div>
          </div>

          {/* Hero CTA */}
          {dispStatus === 'upcoming' && regOpen && !isFull && (
            <div className="shrink-0">
              <RegisterModal
                eventId={event.id}
                eventTitle={event.title}
                formFields={formFields}
                triggerClassName="btn btn-primary px-6 py-2.5 text-sm font-semibold shadow-lg"
                triggerLabel={<>Zapisz się <ChevronRight className="w-4 h-4" /></>}
              />
            </div>
          )}
          {dispStatus === 'ongoing' && event.has_results && event.results_public && (
            <Link href={`/live/${event.slug}`} className="btn btn-primary shrink-0 px-6 py-2.5 text-sm font-semibold shadow-lg">
              <Radio className="w-4 h-4 animate-pulse" />
              Wyniki na żywo
            </Link>
          )}
        </div>
      </div>

      {/* ── Two-column layout ──────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">

        {/* ── Left column ──────────────────────────────────────── */}
        <div className="lg:col-span-2 space-y-6">

          {/* About */}
          {event.description && (
            <div className="bg-card rounded-3xl border border-border p-6 shadow-sm">
              <h2 className="font-heading font-semibold text-lg text-foreground mb-4">O wydarzeniu</h2>
              <p className="text-foreground/80 leading-relaxed whitespace-pre-line wrap-anywhere">{event.description}</p>
            </div>
          )}

          {/* Schedule link */}
          {hasSchedule && (
            <div className="bg-card rounded-3xl border border-border p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-heading font-semibold text-lg text-foreground">Harmonogram</h2>
                <Link
                  href={`/events/${event.slug}/schedule`}
                  className="text-sm text-accent font-medium hover:underline flex items-center gap-1"
                >
                  Zobacz pełny <ChevronRight className="w-4 h-4" />
                </Link>
              </div>
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <CalendarDays className="w-4 h-4 shrink-0" />
                <span>Grafik godzinowy dostępny dla tego wydarzenia</span>
              </div>
            </div>
          )}

          {/* Gallery */}
          {Array.isArray(event.gallery_images) && event.gallery_images.length > 0 && (
            <div className="bg-card rounded-3xl border border-border p-6 shadow-sm space-y-4">
              <h2 className="font-heading font-semibold text-lg text-foreground">Galeria</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {event.gallery_images.map((url: string, i: number) => (
                  <a key={url + i} href={url} target="_blank" rel="noopener noreferrer">
                    <div className="relative aspect-[4/3] rounded-2xl overflow-hidden border border-border hover:opacity-90 transition-opacity">
                      <Image src={url} alt={`Zdjęcie ${i + 1}`} fill className="object-cover" unoptimized />
                    </div>
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Right sidebar ─────────────────────────────────────── */}
        <div className="space-y-4 lg:sticky lg:top-24">

          {/* Status + Registration card */}
          <div className="bg-card rounded-3xl border border-border p-5 shadow-sm space-y-4">

            {/* Status header */}
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-widest font-semibold text-muted-foreground">Status</span>
              <span className={`inline-flex items-center gap-1.5 text-sm font-semibold ${
                dispStatus === 'ongoing' ? 'text-emerald-700' :
                dispStatus === 'upcoming' ? 'text-blue-700' :
                dispStatus === 'cancelled' ? 'text-red-600' :
                'text-muted-foreground'
              }`}>
                <span className={`w-2 h-2 rounded-full ${statusDotColor[dispStatus] ?? 'bg-muted-foreground'} ${isOngoing ? 'animate-pulse' : ''}`} />
                {statusLabel(dispStatus)}
              </span>
            </div>

            {/* Participant progress */}
            {maxParticipants != null && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <PawPrint className="w-3.5 h-3.5" />
                    Zapisanych psów
                  </span>
                  <span className="font-semibold text-foreground">
                    {registeredCount} <span className="text-muted-foreground font-normal">/ {maxParticipants}</span>
                  </span>
                </div>
                <div className="h-2 bg-secondary rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${isFull ? 'bg-red-500' : 'bg-accent'}`}
                    style={{ width: `${fillPct ?? 0}%` }}
                  />
                </div>
              </div>
            )}

            {/* Days remaining */}
            {daysRemaining != null && daysRemaining > 0 && (
              <div className="flex items-center gap-2 text-sm">
                <Clock className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className="text-muted-foreground">Pozostało</span>
                <span className="font-semibold text-foreground ml-auto">
                  {formatPolishCount(daysRemaining, POLISH_FORMS.day)}
                </span>
              </div>
            )}

            {/* Entry fee */}
            {event.entry_fee != null && (
              <div className="flex items-center gap-2 text-sm border-t border-border pt-3">
                <Banknote className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className="text-muted-foreground">Wpisowe</span>
                <span className="font-semibold text-foreground ml-auto">{event.entry_fee} zł</span>
              </div>
            )}

            {/* Registration deadline */}
            {event.registration_deadline && dispStatus === 'upcoming' && regOpen && (
              <div className="flex items-start gap-2 text-sm border-t border-border pt-3">
                <Lock className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                <div>
                  <p className="text-muted-foreground">Zapisy otwarte do</p>
                  <p className="font-medium text-foreground">{formatDate(event.registration_deadline)}</p>
                </div>
              </div>
            )}

            {/* User registration status */}
            <UserRegistrationStatus
              eventId={event.id}
              eventTitle={event.title}
              formFields={formFields}
              eventStatus={dispStatus}
            />

            {/* CTA */}
            {dispStatus === 'upcoming' && regOpen && !isFull && (
              <RegisterModal
                eventId={event.id}
                eventTitle={event.title}
                formFields={formFields}
                triggerClassName="btn btn-primary w-full py-2.5"
                triggerLabel="Zapisz się"
              />
            )}
            {dispStatus === 'upcoming' && regOpen && isFull && (
              <div className="flex items-start gap-2 text-sm text-red-600 font-medium bg-red-50 border border-red-100 rounded-xl px-3 py-2.5">
                <Lock className="w-4 h-4 shrink-0 mt-0.5" />
                Brak wolnych miejsc na to wydarzenie
              </div>
            )}
            {dispStatus === 'upcoming' && !regOpen && (
              <div className="flex items-center gap-2 text-sm text-orange-600 font-medium bg-orange-50 rounded-xl px-3 py-2.5">
                <Lock className="w-4 h-4 shrink-0" />
                Zapisy zostały zamknięte
              </div>
            )}
            {dispStatus === 'ongoing' && (
              <p className="text-sm text-emerald-700 font-medium bg-emerald-50 rounded-xl px-3 py-2.5">
                Wydarzenie w trakcie — zapisy niedostępne
              </p>
            )}
            {dispStatus === 'finished' && event.has_results && (
              <Link href={`/archive/${event.slug}`} className="btn btn-secondary w-full py-2.5">
                <Trophy className="w-4 h-4" />
                Zobacz wyniki
              </Link>
            )}
            {dispStatus === 'ongoing' && event.has_results && event.results_public && (
              <Link href={`/live/${event.slug}`} className="btn btn-primary w-full py-2.5">
                <Radio className="w-4 h-4 animate-pulse" />
                Wyniki na żywo
              </Link>
            )}
          </div>

          {/* Location card */}
          {(event.location || event.lat || mapsQuery) && (
            <div className="bg-card rounded-3xl border border-border overflow-hidden shadow-sm">
              {/* Map thumbnail */}
              {event.lat && event.lng ? (
                <div className="h-36 overflow-hidden">
                  <EventMapClient lat={event.lat} lng={event.lng} label={event.location ?? undefined} />
                </div>
              ) : mapsQuery ? (
                <div className="h-36 overflow-hidden">
                  <iframe
                    title="Mapa lokalizacji"
                    src={`https://maps.google.com/maps?q=${mapsQuery}&output=embed&hl=pl&zoom=13`}
                    className="w-full h-full border-0 pointer-events-none"
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                  />
                </div>
              ) : null}

              {/* Location details */}
              <div className="p-4 space-y-2">
                <h3 className="font-heading font-semibold text-foreground text-sm">Lokalizacja i miejsce</h3>
                {event.location && (
                  <p className="text-sm text-muted-foreground flex items-start gap-1.5">
                    <MapPin className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span className="wrap-anywhere">{event.location}</span>
                  </p>
                )}
                {mapsQuery && (
                  <a
                    href={`https://maps.google.com/?q=${mapsQuery}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-accent font-medium hover:underline inline-flex items-center gap-1"
                  >
                    Otwórz w Google Maps <ChevronRight className="w-3.5 h-3.5" />
                  </a>
                )}
              </div>
            </div>
          )}

          {/* Organizer */}
          {event.organizer_name && (
            <div className="bg-secondary rounded-2xl p-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-1">Organizator</p>
              <p className="text-foreground font-semibold">{event.organizer_name}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

