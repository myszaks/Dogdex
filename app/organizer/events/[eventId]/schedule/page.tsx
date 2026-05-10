import { createServerClient } from '@/lib/supabaseServer'
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

export default async function SchedulePage({ params }: Props) {
  const { eventId } = await params
  await requireRole(['organizer', 'admin'])

  const supabase = createServerClient()

  const [{ data: event }, { data: slots }, { data: registrations }] = await Promise.all([
    supabase.from('events').select('*').eq('id', eventId).single(),
    supabase
      .from('time_slots')
      .select('*')
      .eq('event_id', eventId)
      .order('slot_date', { ascending: true })
      .order('slot_time', { ascending: true }),
    supabase
      .from('registrations')
      .select('id, time_slot_id, schedule_sent_at, participant_id, participants(id, dog_name, owner_name, dog_breed)')
      .eq('event_id', eventId)
      .eq('status', 'confirmed')
      .order('created_at', { ascending: true }),
  ])

  if (!event) notFound()

  const participants = (registrations ?? []).map((r: any) => ({
    registrationId: r.id as string,
    participantId: (r.participants?.id ?? r.participant_id) as string,
    dog_name: (r.participants?.dog_name ?? null) as string | null,
    owner_name: (r.participants?.owner_name ?? null) as string | null,
    dog_breed: (r.participants?.dog_breed ?? null) as string | null,
    schedule_sent_at: r.schedule_sent_at as string | null,
    time_slot_id: r.time_slot_id as string | null,
  }))

  const assignedCount = participants.filter(p => p.time_slot_id !== null).length

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
      />
    </div>
  )
}
