import { createAuthClient } from '@/lib/supabaseServer'
import { notFound } from 'next/navigation'
import { requireRole } from '@/lib/getServerUser'
import ScheduleClient from './ScheduleClient'
import Link from 'next/link'
import type { Metadata } from 'next'

interface Props {
  params: Promise<{ eventId: string }>
}

export const metadata: Metadata = { title: 'Zarządzanie grafikiem' }
export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function SchedulePage({ params }: Props) {
  const { eventId: param } = await params
  const { user, role } = await requireRole(['organizer', 'admin'])

  const supabase = await createAuthClient()

  const { data: event } = await supabase.from('events').select('*')
    .eq(UUID_RE.test(param) ? 'id' : 'slug', param).single()
  if (!event) notFound()
  if (role !== 'admin' && event.created_by !== user.id) notFound()
  const eventId = event.id

  const [{ data: slots }, { data: registrations }] = await Promise.all([
    supabase
      .from('time_slots')
      .select('*')
      .eq('event_id', eventId)
      .order('slot_date', { ascending: true })
      .order('slot_time', { ascending: true }),
    supabase
      .from('registrations')
      .select('id, form_data, participant_id, participants(id, dog_name, owner_name, dog_breed)')
      .eq('event_id', eventId)
      .eq('status', 'confirmed')
      .order('created_at', { ascending: true }),
  ])

  const regIds = (registrations ?? []).map((r: any) => r.id as string)

  const { data: assignments } = regIds.length
    ? await supabase.from('schedule_assignments').select('*').in('registration_id', regIds)
    : { data: [] }

  // Collect multidate field IDs from event form_fields
  const multiDateFieldIds: string[] = ((event as any).form_fields ?? []).filter(
    (f: any) => f.type === 'multidate'
  ).map((f: any) => f.id as string)

  // Collect all unique dates from multidate fields' options
  const availableDates: string[] = Array.from(new Set(
    ((event as any).form_fields ?? [])
      .filter((f: any) => f.type === 'multidate')
      .flatMap((f: any) => Array.isArray(f.options) ? f.options as string[] : [])
      .filter((d: string) => !!d)
      .sort()
  ))

  const participants = (registrations ?? []).map((r: any) => ({
    registrationId: r.id as string,
    participantId: (r.participants?.id ?? r.participant_id) as string,
    dog_name: (r.participants?.dog_name ?? null) as string | null,
    owner_name: (r.participants?.owner_name ?? null) as string | null,
    dog_breed: (r.participants?.dog_breed ?? null) as string | null,
    form_data: (r.form_data ?? {}) as Record<string, unknown>,
  }))

  return (
    <div>
      <Link href="/organizer" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-5 transition-colors">
        ← Panel organizatora
      </Link>
      {/* Tab navigation */}
      <div className="flex gap-1 mb-6 border-b border-slate-200">
        <Link
          href={`/organizer/events/${event.slug}/registrations`}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-slate-500 hover:text-sky-600 transition-colors"
        >
          👥 Zapisy
        </Link>
        <span className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-sky-700 border-b-2 border-sky-600 -mb-px">
          📅 Grafik
        </span>
      </div>

      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <h1 className="page-title mb-0">📅 Grafik godzinowy</h1>
          <p className="text-sm text-slate-500 mt-1">{event.title}</p>
        </div>
        <Link
          href={`/events/${event.slug}/schedule`}
          target="_blank"
          className="btn btn-secondary btn-sm"
        >
          👁️ Podgląd publiczny
        </Link>
      </div>

      <ScheduleClient
        eventId={eventId}
        initialSlots={slots ?? []}
        initialParticipants={participants}
        initialAssignments={(assignments ?? []) as any}
        multiDateFieldIds={multiDateFieldIds}
        availableDates={availableDates}
      />
    </div>
  )
}
