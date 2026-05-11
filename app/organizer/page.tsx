import { createAuthClient } from '@/lib/supabaseServer'
import { requireRole } from '@/lib/getServerUser'
import Link from 'next/link'
import OrganizerEventCard from '@/components/OrganizerEventCard'
import type { DogEvent } from '@/types'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Panel Organizatora' }
export const dynamic = 'force-dynamic'

export default async function OrganizerPage() {
  await requireRole(['organizer', 'admin'])
  const supabase = await createAuthClient()
  const { data: events } = await supabase
    .from('events')
    .select('*')
    .order('start_at', { ascending: false })
    .limit(50)

  const upcoming = events?.filter(e => e.status === 'upcoming').length ?? 0
  const ongoing = events?.filter(e => e.status === 'ongoing').length ?? 0

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-800">⚙️ Panel organizatora</h1>
        <Link href="/organizer/events/new" className="btn btn-primary btn-sm">
          + Nowe
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 sm:grid-cols-3 gap-3 mb-6">
        <div className="card text-center py-3">
          <p className="text-2xl font-bold text-slate-800">{events?.length ?? 0}</p>
          <p className="text-xs text-slate-500">Wszystkich</p>
        </div>
        <div className="card text-center py-3">
          <p className="text-2xl font-bold text-blue-600">{upcoming}</p>
          <p className="text-xs text-slate-500">Nadchodzące</p>
        </div>
        <div className="card text-center py-3">
          <p className="text-2xl font-bold text-green-600">{ongoing}</p>
          <p className="text-xs text-slate-500">W trakcie</p>
        </div>
      </div>

      {!events || events.length === 0 ? (
        <div className="card text-center py-12 text-slate-500">
          <p className="text-4xl mb-3">📋</p>
          <p>Brak wydarzeń. Utwórz pierwsze!</p>
          <Link href="/organizer/events/new" className="btn btn-primary btn-sm mt-4 inline-flex">
            + Nowe wydarzenie
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {events.map((event: DogEvent) => (
            <OrganizerEventCard key={event.id} event={event} />
          ))}
        </div>
      )}
    </div>
  )
}
