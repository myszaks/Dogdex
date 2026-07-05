import { createAuthClient } from '@/lib/supabaseServer'
import { requireRole } from '@/lib/getServerUser'
import Link from 'next/link'
import OrganizerEventGroups from '@/components/OrganizerEventGroups'
import OrganizerCalendar from '@/components/OrganizerCalendar'
import { effectiveStatus } from '@/lib/utils'
import type { DogEvent } from '@/types'
import type { Metadata } from 'next'
import { Plus, LayoutDashboard, Calendar, Activity } from 'lucide-react'

export const metadata: Metadata = { title: 'Panel Organizatora' }
export const dynamic = 'force-dynamic'

export default async function OrganizerPage() {
  const { user, role } = await requireRole(['organizer', 'admin'])
  const supabase = await createAuthClient()

  const query = supabase
    .from('events')
    .select('*')
    .order('start_at', { ascending: false })
    .limit(200)

  const { data: events } = role === 'admin'
    ? await query
    : await query.eq('created_by', user.id)

  const eventIds = (events ?? []).map(event => event.id)
  const registrationCountMap: Record<string, number> = {}

  if (eventIds.length > 0) {
    const { data: activeRegistrations } = await supabase
      .from('registrations')
      .select('event_id')
      .in('event_id', eventIds)
      .in('status', ['pending', 'confirmed'])

    for (const registration of activeRegistrations ?? []) {
      const eventId = registration.event_id as string
      registrationCountMap[eventId] = (registrationCountMap[eventId] ?? 0) + 1
    }
  }

  const total = events?.length ?? 0
  const upcoming = events?.filter(e => effectiveStatus(e) === 'upcoming').length ?? 0
  const ongoing = events?.filter(e => effectiveStatus(e) === 'ongoing').length ?? 0

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="page-title mb-1">Panel organizatora</h1>
          <p className="text-muted-foreground text-sm">Zarządzaj swoimi wydarzeniami</p>
        </div>
        <Link href="/organizer/events/new" className="btn btn-primary">
          <Plus className="w-4 h-4" />
          Nowe wydarzenie
        </Link>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_288px] gap-6 items-start">
        {/* Left column: stats + event list */}
        <div>
          {/* Stats */}
          <div className="grid grid-cols-3 gap-4 mb-8">
            <div className="bg-card rounded-2xl border border-border p-5 text-center shadow-sm">
              <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center mx-auto mb-2">
                <LayoutDashboard className="w-5 h-5 text-primary" />
              </div>
              <p className="text-2xl font-heading font-bold text-foreground">{total}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Wszystkich</p>
            </div>
            <div className="bg-card rounded-2xl border border-border p-5 text-center shadow-sm">
              <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center mx-auto mb-2">
                <Calendar className="w-5 h-5 text-blue-600" />
              </div>
              <p className="text-2xl font-heading font-bold text-blue-600">{upcoming}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Nadchodzące</p>
            </div>
            <div className="bg-card rounded-2xl border border-border p-5 text-center shadow-sm">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center mx-auto mb-2">
                <Activity className="w-5 h-5 text-emerald-600" />
              </div>
              <p className="text-2xl font-heading font-bold text-emerald-600">{ongoing}</p>
              <p className="text-xs text-muted-foreground mt-0.5">W trakcie</p>
            </div>
          </div>

          {!events || events.length === 0 ? (
            <div className="bg-card rounded-3xl border border-border p-16 text-center shadow-sm">
              <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center mx-auto mb-4">
                <Calendar className="w-8 h-8 text-muted-foreground" />
              </div>
              <p className="font-heading font-semibold text-foreground text-lg">Brak wydarzeń</p>
              <p className="text-muted-foreground text-sm mt-1 mb-6">Utwórz swoje pierwsze wydarzenie!</p>
              <Link href="/organizer/events/new" className="btn btn-primary inline-flex">
                <Plus className="w-4 h-4" />
                Nowe wydarzenie
              </Link>
            </div>
          ) : (
            <OrganizerEventGroups
              events={events as DogEvent[]}
              registrationCountMap={registrationCountMap}
            />
          )}
        </div>

        {/* Right column: calendar */}
        <aside className="sticky top-4">
          <OrganizerCalendar events={(events ?? []) as DogEvent[]} />
        </aside>
      </div>
    </div>
  )
}

