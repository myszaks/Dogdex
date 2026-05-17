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
  const now = new Date().toISOString()
  const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()

  let query = supabase
    .from('events')
    .select('*')
    .or(`status.in.(finished,cancelled),end_at.lt.${now},and(end_at.is.null,start_at.lt.${twoDaysAgo})`)
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
    <div className="max-w-7xl mx-auto">
      <h1 className="page-title mb-6">Archiwum wydarzeń</h1>

      <Suspense>
        <EventFilter />
      </Suspense>

      {error && process.env.NODE_ENV === 'development' && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
          <strong>Błąd bazy danych:</strong> {error.message}
        </div>
      )}

      {!events || events.length === 0 ? (
        <div className="bg-card rounded-3xl border border-border p-16 text-center shadow-sm mt-6">
          <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">📂</span>
          </div>
          <p className="text-muted-foreground">Brak zarchiwizowanych wydarzeń</p>
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 mt-6">
          {events.map((event: DogEvent) => (
            <EventCard key={event.id} event={event} />
          ))}
        </div>
      )}
    </div>
  )
}
