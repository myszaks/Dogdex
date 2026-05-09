import { createServerClient } from '@/lib/supabaseServer'
import { notFound } from 'next/navigation'
import EditEventClient from './EditEventClient'
import type { Metadata } from 'next'

interface Props {
  params: Promise<{ eventId: string }>
}

export const metadata: Metadata = { title: 'Edytuj wydarzenie' }

export default async function EditEventPage({ params }: Props) {
  const { eventId } = await params
  const supabase = createServerClient()
  const { data: event } = await supabase
    .from('events')
    .select('*')
    .eq('id', eventId)
    .single()

  if (!event) notFound()

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="page-title">✏️ Edytuj wydarzenie</h1>
      <EditEventClient
        eventId={eventId}
        initialData={{
          title: event.title,
          description: event.description,
          location: event.location,
          start_at: event.start_at,
          end_at: event.end_at,
          registration_deadline: event.registration_deadline ?? null,
          status: event.status,
          event_type_id: event.event_type_id ?? null,
          form_fields: Array.isArray(event.form_fields) ? event.form_fields : [],
          has_results: event.has_results ?? false,
          results_public: event.results_public ?? true,
          auto_confirm: event.auto_confirm ?? false,
          max_participants: event.max_participants ?? null,
          image_url: event.image_url ?? null,
          organizer_name: event.organizer_name ?? null,
        }}
      />
    </div>
  )
}
