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
  await requireRole(['organizer', 'admin'])

  const supabase = await createAuthClient()

  const { data: event } = await supabase.from('events').select('*')
    .eq(UUID_RE.test(param) ? 'id' : 'slug', param).single()
  if (!event) notFound()
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

  const assignedRegIds = new Set((assignments ?? []).map((a: any) => a.registration_id as string))
  const assignedCount = assignedRegIds.size

  return (
    <div>
      <Link
        href={`/organizer/events/${eventId}/registrations`}
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-sky-600 mb-5 transition-colors"
      >
        ← Powrót do zapisów
      </Link>

      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <h1 className="page-title mb-0">📅 Grafik godzinowy</h1>
          <p className="text-sm text-slate-500 mt-1">{event.title}</p>
        </div>
        <Link
          href={`/events/${event.slug ?? event.id}/schedule`}
          target="_blank"
          className="btn btn-secondary btn-sm"
        >
          👁️ Podgląd publiczny
        </Link>
      </div>

      <div className="card mb-5 bg-sky-50 border-sky-200">
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-xl font-bold text-slate-800">{participants.length}</p>
            <p className="text-xs text-slate-500">Potwierdzonych</p>
          </div>
          <div>
            <p className="text-xl font-bold text-blue-600">{slots?.length ?? 0}</p>
            <p className="text-xs text-slate-500">Slotów</p>
          </div>
          <div>
            <p className="text-xl font-bold text-green-600">{assignedCount}</p>
            <p className="text-xs text-slate-500">Przypisanych</p>
          </div>
        </div>
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
