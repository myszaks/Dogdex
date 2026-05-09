import { createServerClient } from '@/lib/supabaseServer'
import EventCard from '@/components/EventCard'
import EventFilter from '@/components/EventFilter'
import { Suspense } from 'react'
import type { DogEvent } from '@/types'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Archiwum' }
export const dynamic = 'force-dynamic'

interface Props {
  searchParams: Promise<{ typ?: string; lokalizacja?: string; szukaj?: string; organizator?: string }>
}

export default async function ArchivePage({ searchParams }: Props) {
  const sp = await searchParams
  const supabase = createServerClient()

  let query = supabase
    .from('events')
    .select('*')
    .in('status', ['finished', 'cancelled'])
    .order('start_at', { ascending: false })

  if (sp.typ) query = query.eq('event_type_id', sp.typ)
  if (sp.lokalizacja)
    query = query.ilike('location', `%${sp.lokalizacja}%`)
  if (sp.szukaj)
    query = query.ilike('title', `%${sp.szukaj}%`)
  if (sp.organizator)
    query = query.ilike('organizer_name', `%${sp.organizator}%`)

  const { data: events, error } = await query

  return (
    <div>
      <h1 className="page-title">🗁️ Archiwum wydarzeń</h1>

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
          <p className="text-5xl mb-4">📂</p>
          <p className="text-slate-500">Brak zarchiwizowanych wydarzeń</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {events.map((event: DogEvent) => (
            <EventCard key={event.id} event={event} />
          ))}
        </div>
      )}
    </div>
  )
}
