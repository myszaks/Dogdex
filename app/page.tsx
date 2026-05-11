import { createServerClient } from '@/lib/supabaseServer'
import Link from 'next/link'
import EventCard from '@/components/EventCard'
import EventFilter from '@/components/EventFilter'
import { formatDate } from '@/lib/utils'
import { Suspense } from 'react'
import type { DogEvent } from '@/types'

export const dynamic = 'force-dynamic'

interface Props {
  searchParams: Promise<{ typ?: string; lokalizacja?: string; szukaj?: string; organizator?: string }>
}

export default async function HomePage({ searchParams }: Props) {
  const sp = await searchParams
  const supabase = createServerClient()
  const now = new Date().toISOString()
  // Show events not yet ended: end_at in future, OR no end_at (and started within 48h), OR no start_at
  const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()

  let query = supabase
    .from('events')
    .select('*')
    .in('status', ['upcoming', 'ongoing'])
    .or(`end_at.gt.${now},and(end_at.is.null,start_at.gt.${twoDaysAgo}),start_at.is.null`)
    .order('start_at', { ascending: true })

  if (sp.typ) query = query.eq('event_type_id', sp.typ)
  if (sp.lokalizacja)
    query = query.ilike('location', `%${sp.lokalizacja}%`)
  if (sp.szukaj)
    query = query.ilike('title', `%${sp.szukaj}%`)
  if (sp.organizator)
    query = query.ilike('organizer_name', `%${sp.organizator}%`)

  const { data: events, error } = await query

  // Recently cancelled (last 30 days) — only when no filters active
  const hasFilters = sp.typ || sp.lokalizacja || sp.szukaj || sp.organizator
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const { data: cancelledEvents } = hasFilters ? { data: null } : await supabase
    .from('events')
    .select('id, title, start_at, location')
    .eq('status', 'cancelled')
    .gte('start_at', thirtyDaysAgo)
    .order('start_at', { ascending: true })
    .limit(3)

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">🐾 Nadchodzące wydarzenia</h1>
        <p className="text-slate-500 text-sm mt-1">Zawody, eventy i spacery dla Ciebie i Twojego psa</p>
      </div>

      <Suspense>
        <EventFilter />
      </Suspense>

      {error && process.env.NODE_ENV === 'development' && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
          <strong>Błąd bazy danych:</strong> {error.message}
        </div>
      )}

      {!events || events.length === 0 ? (
        <div className="card text-center py-16">
          <p className="text-5xl mb-4">🐾</p>
          <p className="text-slate-500 font-medium">Brak wydarzeń spełniających kryteria</p>
          <p className="text-slate-400 text-sm mt-1">Sprawdź archiwum poprzednich edycji</p>
          <Link href="/archive" className="btn btn-secondary btn-sm mt-4 inline-flex">
            Archiwum
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {events.map((event: DogEvent) => (
            <EventCard key={event.id} event={event} />
          ))}
        </div>
      )}

      {cancelledEvents && cancelledEvents.length > 0 && (
        <div className="mt-8">
          <p className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-3">
            🚫 Niedawno odwołane
          </p>
          <div className="space-y-2">
            {cancelledEvents.map((e: any) => (
              <div key={e.id} className="card opacity-60 flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium text-slate-600 line-through">{e.title}</p>
                  {e.start_at && (
                    <p className="text-xs text-slate-400">📅 {formatDate(e.start_at)}</p>
                  )}
                  {e.location && (
                    <p className="text-xs text-slate-400">📍 {e.location}</p>
                  )}
                </div>
                <span className="badge badge-red shrink-0">Odwołane</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

