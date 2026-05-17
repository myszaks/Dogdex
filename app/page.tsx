import { createServerClient } from '@/lib/supabaseServer'
import Link from 'next/link'
import EventCard from '@/components/EventCard'
import EventSearchBar from '@/components/EventSearchBar'
import { formatDate, effectiveStatus } from '@/lib/utils'
import { EVENT_TYPES } from '@/lib/eventTypes'
import { Suspense } from 'react'
import type { DogEvent } from '@/types'
import { CalendarDays, Radio, CalendarX2, MapPin, PawPrint } from 'lucide-react'

export const dynamic = 'force-dynamic'

interface Props {
  searchParams: Promise<{ typ?: string; lokalizacja?: string; szukaj?: string; organizator?: string }>
}

export default async function HomePage({ searchParams }: Props) {
  const sp = await searchParams
  const supabase = createServerClient()
  const now = new Date().toISOString()
  const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()

  let query = supabase
    .from('events')
    .select('*')
    .in('status', ['upcoming', 'ongoing'])
    .or(`end_at.gt.${now},and(end_at.is.null,start_at.gt.${twoDaysAgo}),start_at.is.null`)
    .order('start_at', { ascending: true })

  if (sp.lokalizacja) query = query.ilike('location', `%${sp.lokalizacja}%`)
  if (sp.szukaj) {
    const term = sp.szukaj
    const matchingTypeIds = EVENT_TYPES
      .filter(t => t.name.toLowerCase().includes(term.toLowerCase()))
      .map(t => t.id)
    if (matchingTypeIds.length > 0) {
      query = query.or(`title.ilike.%${term}%,event_type_id.in.(${matchingTypeIds.join(',')})`)
    } else {
      query = query.ilike('title', `%${term}%`)
    }
  }
  if (sp.organizator) query = query.ilike('organizer_name', `%${sp.organizator}%`)

  const { data: events, error } = await query

  const hasFilters = sp.lokalizacja || sp.szukaj || sp.organizator

  // Cancelled sidebar: only events whose planned start hasn't passed yet
  const { data: cancelledEvents } = hasFilters ? { data: null } : await supabase
    .from('events')
    .select('id, title, start_at, location')
    .eq('status', 'cancelled')
    .gt('start_at', now)
    .order('start_at', { ascending: true })
    .limit(5)

  const allEvents: DogEvent[] = events ?? []
  const ongoingEvents = allEvents.filter(e => effectiveStatus(e) === 'ongoing')
  const upcomingEvents = allEvents.filter(e => effectiveStatus(e) === 'upcoming')
  const hasCancelled = (cancelledEvents?.length ?? 0) > 0

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Page heading */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-2xl bg-primary flex items-center justify-center shrink-0">
          <PawPrint className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-heading font-bold text-foreground leading-tight">
            Wydarzenia
          </h1>
          <p className="text-sm text-muted-foreground">Zawody, eventy i spacery dla Ciebie i Twojego psa</p>
        </div>
      </div>

      <Suspense>
        <EventSearchBar />
      </Suspense>

      {error && process.env.NODE_ENV === 'development' && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
          <strong>Błąd bazy danych:</strong> {error.message}
        </div>
      )}

      {/* Main content + cancelled sidebar */}
      <div className="flex flex-col xl:flex-row gap-6 items-start">

        {/* ── Left: event sections ── */}
        <div className="flex-1 min-w-0 space-y-8">

          {/* ONGOING */}
          {ongoingEvents.length > 0 && (
            <section>
              <SectionLabel icon={<Radio className="w-3.5 h-3.5 animate-pulse text-emerald-600" />} label="Trwające" accent="emerald" />
              <div className="grid gap-5 sm:grid-cols-2">
                {ongoingEvents.map((event) => (
                  <EventCard key={event.id} event={event} />
                ))}
              </div>
            </section>
          )}

          {/* UPCOMING */}
          {upcomingEvents.length > 0 && (
            <section>
              <SectionLabel icon={<CalendarDays className="w-3.5 h-3.5 text-blue-500" />} label="Nadchodzące" />
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {upcomingEvents.map((event) => (
                  <EventCard key={event.id} event={event} />
                ))}
              </div>
            </section>
          )}

          {/* Empty state */}
          {allEvents.length === 0 && (
            <div className="bg-card rounded-3xl border border-border p-16 text-center shadow-sm">
              <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center mx-auto mb-4">
                <CalendarDays className="w-8 h-8 text-muted-foreground" />
              </div>
              <p className="font-heading font-semibold text-foreground text-lg">Brak wydarzeń</p>
              <p className="text-muted-foreground text-sm mt-1 mb-6">
                {hasFilters ? 'Brak wyników dla wybranych filtrów.' : 'Sprawdź archiwum poprzednich edycji.'}
              </p>
              <Link href="/archive" className="btn btn-secondary btn-sm inline-flex">
                Przeglądaj archiwum
              </Link>
            </div>
          )}
        </div>

        {/* ── Right: cancelled sidebar ── */}
        {hasCancelled && (
          <aside className="w-full xl:w-52 shrink-0">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3 flex items-center gap-1.5">
              <CalendarX2 className="w-3.5 h-3.5 text-red-400" />
              Odwołane
            </p>
            <div className="space-y-2">
              {cancelledEvents!.map((e: any) => (
                <div
                  key={e.id}
                  className="bg-card rounded-2xl border border-border px-3 py-2.5 opacity-60"
                >
                  <p className="text-xs font-medium text-foreground line-through leading-tight line-clamp-2">
                    {e.title}
                  </p>
                  {e.start_at && (
                    <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-1">
                      <CalendarDays className="w-3 h-3 shrink-0" />
                      {formatDate(e.start_at)}
                    </p>
                  )}
                  {e.location && (
                    <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                      <MapPin className="w-3 h-3 shrink-0" />
                      <span className="truncate">{e.location}</span>
                    </p>
                  )}
                </div>
              ))}
            </div>
          </aside>
        )}

      </div>
    </div>
  )
}

function SectionLabel({
  icon,
  label,
  accent,
}: {
  icon: React.ReactNode
  label: string
  accent?: 'emerald'
}) {
  return (
    <p className={`text-xs font-semibold uppercase tracking-widest mb-4 flex items-center gap-1.5 ${accent === 'emerald' ? 'text-emerald-700' : 'text-muted-foreground'}`}>
      {icon}
      {label}
    </p>
  )
}

