import { notFound } from 'next/navigation'
import EventWorkspaceShell from '@/components/EventWorkspaceShell'
import { getEventAccess } from '@/lib/eventAccess'

export default async function EventLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ eventId: string }>
}) {
  const { eventId } = await params
  const access = await getEventAccess(eventId)
  if (!access) notFound()
  const event = access.event

  return (
    <EventWorkspaceShell
      event={{
        slug: event.slug,
        title: event.title,
        eventTypeId: event.event_type_id ?? null,
        hasSchedule: Boolean(event.has_schedule),
        hasResults: Boolean(event.has_results),
      }}
      permissions={access.permissions}
      canManageTeam={access.canManageTeam}
    >
      {children}
    </EventWorkspaceShell>
  )
}
