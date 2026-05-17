import { createAuthClient } from '@/lib/supabaseServer'
import { notFound } from 'next/navigation'
import EditEventClient from './EditEventClient'
import type { Metadata } from 'next'

interface Props {
  params: Promise<{ eventId: string }>
}

export const metadata: Metadata = { title: 'Edytuj wydarzenie' }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function EditEventPage({ params }: Props) {
  const { eventId: param } = await params
  const supabase = await createAuthClient()
  const { data: event } = await supabase
    .from('events')
    .select('*')
    .eq(UUID_RE.test(param) ? 'id' : 'slug', param)
    .single()

  if (!event) notFound()
  const eventId = event.id

  return (
    <div>
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
          has_schedule: event.has_schedule ?? false,
          auto_confirm: event.auto_confirm ?? false,
          max_participants: event.max_participants ?? null,
          entry_fee: event.entry_fee ?? null,
          image_url: event.image_url ?? null,
          organizer_name: event.organizer_name ?? null,
          lat: event.lat ?? null,
          lng: event.lng ?? null,
          gallery_images: Array.isArray(event.gallery_images) ? event.gallery_images : [],
          grouping_field: event.grouping_field ?? null,
        }}
      />
    </div>
  )
}
