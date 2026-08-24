import { createServerClient } from '@/lib/supabaseServer'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { formatDate, isRegistrationOpen, registrationPhase, effectiveStatus } from '@/lib/utils'
import RegisterForm from '@/components/RegisterForm'
import { getEventType } from '@/lib/eventTypes'
import type { Metadata } from 'next'
import type { FormField } from '@/types'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function resolveEvent(param: string) {
  const supabase = createServerClient()
  const { data: bySlug } = await supabase.from('events').select('*').eq('slug', param).neq('status', 'draft').maybeSingle()
  if (bySlug) return { event: bySlug, redirectTo: null }
  if (UUID_RE.test(param)) {
    const { data: byId } = await supabase.from('events').select('*').eq('id', param).neq('status', 'draft').maybeSingle()
    if (byId) {
      const target = `/register/${byId.slug}`
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
  return { title: `Zapis – ${event?.title ?? 'Wydarzenie'}` }
}

export default async function RegisterPage({ params }: Props) {
  const { eventId } = await params
  const { event, redirectTo } = await resolveEvent(eventId)

  if (!event) notFound()
  if (redirectTo) redirect(redirectTo)

  const regOpen = isRegistrationOpen(event)
  const regPhase = registrationPhase(event)
  const dispStatus = effectiveStatus(event)
  const eventHref = `/events/${event.slug}`

  if (dispStatus !== 'upcoming' || !regOpen) {
    return (
      <div className="max-w-lg mx-auto">
        <Link href={eventHref} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-5 transition-colors">
          ← Powrót do wydarzenia
        </Link>
        <div className="card text-center py-16">
          <p className="text-5xl mb-4">{dispStatus !== 'upcoming' ? '🚫' : '🔒'}</p>
          <p className="text-lg font-semibold text-slate-700">
            {dispStatus !== 'upcoming'
              ? 'Zapisy niedostępne'
              : regPhase === 'not_started'
                ? 'Zapisy jeszcze się nie rozpoczęły'
                : 'Zapisy zamknięte'}
          </p>
          <p className="text-slate-500 text-sm mt-2">
            {dispStatus !== 'upcoming'
              ? 'To wydarzenie nie przyjmuje już zapisów.'
              : regPhase === 'not_started' && event.registration_opens_at
                ? `Zapisy rozpoczną się ${formatDate(event.registration_opens_at)}.`
                : 'Termin zapisów minął.'}
          </p>
        </div>
      </div>
    )
  }

  const formFields: FormField[] = Array.isArray(event.form_fields) ? event.form_fields : []
  const eventType = getEventType(event.event_type_id)

  return (
    <div className="max-w-lg mx-auto">
      <Link href={eventHref} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-5 transition-colors">
        ← Powrót do wydarzenia
      </Link>
      <h1 className="page-title">📋 Zapis na wydarzenie</h1>

      <div className="card mb-6 bg-sky-50 border-sky-200">
        {eventType && (
          <p className="text-xs font-semibold text-sky-500 uppercase tracking-wide mb-1">
            {eventType.icon} {eventType.name}
          </p>
        )}
        <h2 className="font-semibold text-lg text-sky-800">{event.title}</h2>
        {event.start_at && (
          <p className="text-sm text-sky-600 mt-1">📅 {formatDate(event.start_at)}</p>
        )}
        {event.location && (
          <p className="text-sm text-sky-600">📍 {event.location}</p>
        )}
      </div>

      <RegisterForm eventId={event.id} formFields={formFields} />
    </div>
  )
}
