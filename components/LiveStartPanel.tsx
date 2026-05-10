'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

interface StartParticipant {
  registration_id: string
  dog_name: string | null
  owner_name: string | null
  dog_breed: string | null
}

interface Props {
  eventId: string
  initialStartIndex: number
  participants: StartParticipant[]
}

export default function LiveStartPanel({ eventId, initialStartIndex, participants }: Props) {
  const [startIndex, setStartIndex] = useState(initialStartIndex)

  useEffect(() => {
    const channel = supabase
      .channel(`live-start-${eventId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'events', filter: `id=eq.${eventId}` },
        (payload) => {
          const newIndex = (payload.new as Record<string, unknown>)?.current_start_index
          if (typeof newIndex === 'number') setStartIndex(newIndex)
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [eventId])

  if (participants.length === 0) return null

  const current = participants[startIndex] ?? null
  const next1 = participants[startIndex + 1] ?? null
  const next2 = participants[startIndex + 2] ?? null

  return (
    <div className="mb-6 space-y-3">
      <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">🏁 Na starcie</h2>

      {current ? (
        <div className="card border-2 border-green-400 bg-green-50">
          <div className="flex items-center gap-3">
            <span className="text-4xl">🐕</span>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-green-600 uppercase tracking-wide mb-0.5">
                Aktualnie na starcie
              </p>
              <p className="text-xl font-bold text-slate-800 truncate">{current.dog_name ?? '—'}</p>
              <p className="text-sm text-slate-600">{current.owner_name ?? '—'}</p>
              {current.dog_breed && (
                <p className="text-xs text-slate-400">{current.dog_breed}</p>
              )}
            </div>
            <div className="text-right shrink-0">
              <p className="text-xs text-slate-400">Kolejność</p>
              <p className="text-3xl font-bold text-green-600">{startIndex + 1}</p>
              <p className="text-xs text-slate-400">/ {participants.length}</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="card text-center py-8 text-slate-400">
          <p className="text-3xl mb-2">🏁</p>
          <p className="font-medium">Wszyscy zawodnicy ukończyli</p>
        </div>
      )}

      {(next1 || next2) && (
        <div className="card bg-slate-50">
          <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">
            Przygotowuje się
          </p>
          <div className="space-y-2">
            {[next1, next2].filter(Boolean).map((p, i) =>
              p ? (
                <div key={p.registration_id} className="flex items-center gap-3">
                  <span className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-600 shrink-0">
                    {startIndex + i + 2}
                  </span>
                  <div>
                    <p className="font-medium text-slate-700 text-sm">{p.dog_name ?? '—'}</p>
                    <p className="text-xs text-slate-400">{p.owner_name ?? '—'}</p>
                  </div>
                </div>
              ) : null
            )}
          </div>
        </div>
      )}
    </div>
  )
}
