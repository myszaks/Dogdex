'use client'
import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { formatTime } from '@/lib/utils'

interface ParticipantInfo {
  dog_name: string | null
  owner_name: string | null
  dog_breed: string | null
}

interface ResultRow {
  id: string
  rank: number | null
  time_ms: number | null
  notes: string | null
  participants: ParticipantInfo | null
}

interface Props {
  eventId: string
  initialResults: ResultRow[]
}

export default function LiveResults({ eventId, initialResults }: Props) {
  const [results, setResults] = useState<ResultRow[]>(initialResults)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [connected, setConnected] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const fetchResults = useCallback(async () => {
    const { data } = await supabase
      .from('results')
      .select('*, participants(dog_name, owner_name, dog_breed)')
      .eq('event_id', eventId)
      .order('rank', { ascending: true })
    if (data) {
      setResults(data as ResultRow[])
      setLastUpdated(new Date())
    }
  }, [eventId])

  async function handleRefresh() {
    setRefreshing(true)
    await fetchResults()
    setRefreshing(false)
  }

  useEffect(() => {
    const channel = supabase
      .channel(`live-results-${eventId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'results',
          filter: `event_id=eq.${eventId}`,
        },
        async () => {
          await fetchResults()
        }
      )
      .subscribe(status => {
        setConnected(status === 'SUBSCRIBED')
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [eventId, fetchResults])

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm text-slate-500">
          {lastUpdated
            ? `Ostatnia aktualizacja: ${lastUpdated.toLocaleTimeString('pl-PL')}`
            : 'Oczekiwanie na wyniki...'}
        </p>
        <div className="flex items-center gap-2">
          {!connected && (
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="btn btn-secondary btn-sm text-xs"
              title="Odśwież ręcznie"
            >
              {refreshing ? '...' : '↻ Odśwież'}
            </button>
          )}
          <span className={`badge ${connected ? 'badge-green' : 'badge-red'}`}>
            {connected ? '● Połączono' : '○ Rozłączono'}
          </span>
        </div>
      </div>

      {results.length === 0 ? (
        <div className="card text-center py-16">
          <p className="text-5xl mb-4">⏳</p>
          <p className="text-slate-500 font-medium">Oczekiwanie na wyniki</p>
          <p className="text-slate-400 text-sm mt-1">
            Wyniki pojawią się tu automatycznie po wpisaniu przez organizatora
          </p>
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b">
                <th className="pb-3 pr-3 w-10">#</th>
                <th className="pb-3 pr-3">Pies</th>
                <th className="pb-3 pr-3">Właściciel</th>
                <th className="pb-3 pr-3 hidden sm:table-cell">Rasa</th>
                <th className="pb-3 pr-3">Czas</th>
                <th className="pb-3 hidden sm:table-cell">Uwagi</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r, i) => (
                <tr
                  key={r.id}
                  className={`border-b last:border-0 transition-colors ${
                    i === 0 ? 'bg-yellow-50' : 'hover:bg-slate-50'
                  }`}
                >
                  <td className="py-3 pr-3 text-lg font-bold">
                    {r.rank === 1
                      ? '🥇'
                      : r.rank === 2
                      ? '🥈'
                      : r.rank === 3
                      ? '🥉'
                      : r.rank ?? '—'}
                  </td>
                  <td className="py-3 pr-3 font-medium">
                    {r.participants?.dog_name ?? '—'}
                  </td>
                  <td className="py-3 pr-3 text-slate-600">
                    {r.participants?.owner_name ?? '—'}
                  </td>
                  <td className="py-3 pr-3 text-slate-400 text-xs hidden sm:table-cell">
                    {r.participants?.dog_breed ?? '—'}
                  </td>
                  <td className="py-3 pr-3 font-mono font-semibold">
                    {formatTime(r.time_ms)}
                  </td>
                  <td className="py-3 text-slate-400 text-xs hidden sm:table-cell">
                    {r.notes ?? ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
