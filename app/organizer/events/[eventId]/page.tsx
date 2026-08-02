import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { CalendarDays, Clock3, ListChecks, MapPin, Settings2, Users } from 'lucide-react'
import { createAuthClient } from '@/lib/supabaseServer'
import { effectiveStatus, formatDate } from '@/lib/utils'

interface Props {
  params: Promise<{ eventId: string }>
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const statusLabels: Record<string, string> = {
  draft: 'Szkic',
  upcoming: 'Nadchodzące',
  ongoing: 'Trwające',
  finished: 'Zakończone',
  cancelled: 'Odwołane',
}

export const metadata: Metadata = { title: 'Workspace wydarzenia' }
export const dynamic = 'force-dynamic'

export default async function EventWorkspaceOverview({ params }: Props) {
  const { eventId } = await params
  const supabase = await createAuthClient()
  const { data: event } = await supabase
    .from('events')
    .select('*')
    .eq(UUID_RE.test(eventId) ? 'id' : 'slug', eventId)
    .maybeSingle()

  if (!event) notFound()

  const [registrations, pendingRegistrations, cancellationRequests, timeSlots] = await Promise.all([
    supabase
      .from('registrations')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', event.id)
      .in('status', ['pending', 'confirmed']),
    supabase
      .from('registrations')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', event.id)
      .eq('status', 'pending'),
    supabase
      .from('cancellation_requests')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', event.id)
      .eq('status', 'pending'),
    supabase
      .from('time_slots')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', event.id),
  ])

  const status = effectiveStatus(event)
  const baseHref = `/organizer/events/${event.slug}`

  return (
    <div className="space-y-7">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="font-heading text-2xl font-bold">Podsumowanie</h2>
          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
            {event.start_at && (
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays className="h-4 w-4" />
                {formatDate(event.start_at)}
              </span>
            )}
            {event.location && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="h-4 w-4" />
                {event.location}
              </span>
            )}
          </div>
        </div>
        <span className="inline-flex w-fit rounded-full bg-secondary px-3 py-1.5 text-sm font-semibold text-foreground">
          {statusLabels[status] ?? status}
        </span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Aktywne zapisy" value={registrations.count ?? 0} Icon={Users} />
        <SummaryCard label="Do akceptacji" value={pendingRegistrations.count ?? 0} Icon={ListChecks} />
        <SummaryCard label="Rezygnacje do obsługi" value={cancellationRequests.count ?? 0} Icon={Clock3} attention={(cancellationRequests.count ?? 0) > 0} />
        <SummaryCard label="Pozycje w grafiku" value={timeSlots.count ?? 0} Icon={CalendarDays} />
      </div>

      <div className="card flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="font-heading text-lg font-semibold">
            {status === 'draft' ? 'Dokończ konfigurację wydarzenia' : 'Przejdź do obsługi zapisów'}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {status === 'draft'
              ? 'Sprawdź formularz, publikację i ustawienia wydarzenia.'
              : 'Zatwierdzaj uczestników, obsługuj rezygnacje i eksportuj listę.'}
          </p>
        </div>
        <Link href={status === 'draft' ? `${baseHref}/edit` : `${baseHref}/registrations`} className="btn btn-primary shrink-0">
          {status === 'draft' ? <Settings2 className="h-4 w-4" /> : <ListChecks className="h-4 w-4" />}
          {status === 'draft' ? 'Otwórz ustawienia' : 'Otwórz zapisy'}
        </Link>
      </div>
    </div>
  )
}

function SummaryCard({
  Icon,
  attention = false,
  label,
  value,
}: {
  Icon: React.ElementType
  attention?: boolean
  label: string
  value: number
}) {
  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className={attention ? 'mt-1 text-3xl font-bold text-amber-700' : 'mt-1 text-3xl font-bold'}>{value}</p>
        </div>
        <Icon className={attention ? 'h-7 w-7 text-amber-500' : 'h-7 w-7 text-accent/40'} />
      </div>
    </div>
  )
}
