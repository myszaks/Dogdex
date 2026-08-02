import { notFound } from 'next/navigation'
import EventWorkspaceShell from '@/components/EventWorkspaceShell'
import { createAuthClient } from '@/lib/supabaseServer'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function EventLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ eventId: string }>
}) {
  const { eventId } = await params
  const supabase = await createAuthClient()
  const { data: event } = await supabase
    .from('events')
    .select('slug, title, event_type_id, has_schedule, has_results')
    .eq(UUID_RE.test(eventId) ? 'id' : 'slug', eventId)
    .maybeSingle()

  if (!event) notFound()

  return (
    <EventWorkspaceShell
      event={{
        slug: event.slug,
        title: event.title,
        eventTypeId: event.event_type_id,
        hasSchedule: Boolean(event.has_schedule),
        hasResults: Boolean(event.has_results),
      }}
    >
      {children}
    </EventWorkspaceShell>
  )
}
