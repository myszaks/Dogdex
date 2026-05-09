import { createServerClient } from '@/lib/supabaseServer'
import { notFound } from 'next/navigation'
import { formatDate, isRegistrationOpen } from '@/lib/utils'
import RegisterForm from '@/components/RegisterForm'
import { getEventType } from '@/lib/eventTypes'
import type { Metadata } from 'next'
import type { FormField } from '@/types'

interface Props {
  params: Promise<{ eventId: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { eventId } = await params
  const supabase = createServerClient()
  const { data } = await supabase.from('events').select('title').eq('id', eventId).single()
  return { title: `Zapis – ${data?.title ?? 'Wydarzenie'}` }
}

export default async function RegisterPage({ params }: Props) {
  const { eventId } = await params
  const supabase = createServerClient()
  const { data: event } = await supabase
    .from('events')
    .select('*')
    .eq('id', eventId)
    .single()

  if (!event) notFound()

  const regOpen = isRegistrationOpen(event)

  if (event.status !== 'upcoming' || !regOpen) {
    return (
      <div className="max-w-lg mx-auto">
        <div className="card text-center py-16">
          <p className="text-5xl mb-4">{event.status !== 'upcoming' ? '\uD83D\uDEAB' : '\uD83D\uDD12'}</p>
          <p className="text-lg font-semibold text-slate-700">
            {event.status !== 'upcoming' ? 'Zapisy niedostępne' : 'Zapisy zamknięte'}
          </p>
          <p className="text-slate-500 text-sm mt-2">
            {event.status !== 'upcoming'
              ? 'To wydarzenie nie przyjmuje już zapisów.'
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

      <RegisterForm eventId={eventId} formFields={formFields} />
    </div>
  )
}
