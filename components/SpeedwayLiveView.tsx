'use client'
import { useEffect, useState, useCallback } from 'react'
import { getSupabaseBrowserClient } from '@/lib/supabaseClient'
import { SIZE_CLASSES, SIZE_CLASS_LABELS, formatRunTime } from '@/lib/speedway'
import type { SizeClass } from '@/lib/speedway'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SpeedwayLiveParticipantInfo {
  participantId: string
  dogName: string | null
  ownerName: string | null
  sizeClass: SizeClass
}

interface SpeedwayResult {
  id: string
  participant_id: string
  run1_ms: number | null
  run2_ms: number | null
  run1_status: string | null
  run2_status: string | null
  best_ms: number | null
  speed_kmh: number | null
  size_class: string | null
  class_rank: number | null
}

interface Props {
  eventId: string
  initialStartIndex: number
  initialLivePhase: string | null
  participants: SpeedwayLiveParticipantInfo[]
  initialResults: SpeedwayResult[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeDisplay(ms: number | null, status: string | null): string {
  if (status === 'DNS') return 'DNS'
  if (status === 'DNF') return 'DNF'
  if (ms !== null) return formatRunTime(ms)
  return '—'
}

interface DecodedPosition {
  cls: SizeClass
  run: 1 | 2
  dogInClass: number
  participant: SpeedwayLiveParticipantInfo
}

function decodeGlobalIndex(
  globalIdx: number,
  activeCls: SizeClass[],
  byCls: Record<SizeClass, SpeedwayLiveParticipantInfo[]>
): DecodedPosition | null {
  let offset = 0
  for (const cls of activeCls) {
    const dogs = byCls[cls] ?? []
    const n = dogs.length
    if (globalIdx < offset + n) {
      const dog = dogs[globalIdx - offset]
      return dog ? { cls, run: 1, dogInClass: globalIdx - offset, participant: dog } : null
    }
    offset += n
    if (globalIdx < offset + n) {
      const dog = dogs[globalIdx - offset]
      return dog ? { cls, run: 2, dogInClass: globalIdx - offset, participant: dog } : null
    }
    offset += n
  }
  return null
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SpeedwayLiveView({
  eventId,
  initialStartIndex,
  initialLivePhase,
  participants,
  initialResults,
}: Props) {
  const supabase = getSupabaseBrowserClient()
  const [startIndex, setStartIndex] = useState(initialStartIndex)
  const [livePhase, setLivePhase] = useState(initialLivePhase)
  const [results, setResults] = useState<SpeedwayResult[]>(initialResults)
  const [connected, setConnected] = useState(false)

  // Pre-compute sequence structures (stable — participants don't change)
  const activeSizeClasses = SIZE_CLASSES.filter(cls =>
    participants.some(p => p.sizeClass === cls)
  )
  const byCls = Object.fromEntries(
    SIZE_CLASSES.map(cls => [cls, participants.filter(p => p.sizeClass === cls)])
  ) as Record<SizeClass, SpeedwayLiveParticipantInfo[]>

  // Participants map for quick lookup when rendering results
  const participantsMap = Object.fromEntries(
    participants.map(p => [p.participantId, p])
  )

  // Classes that actually have stored results (authoritative grouping for results table)
  const activeResultClasses = SIZE_CLASSES.filter(cls =>
    results.some(r => r.size_class === cls)
  )

  const fetchResults = useCallback(async () => {
    if (!supabase) return
    const { data } = await supabase
      .from('results')
      .select('id, participant_id, run1_ms, run2_ms, run1_status, run2_status, best_ms, speed_kmh, size_class, class_rank')
      .eq('event_id', eventId)
    if (data) setResults(data as SpeedwayResult[])
  }, [eventId, supabase])

  useEffect(() => {
    if (!supabase) return

    const resultsChannel = supabase
      .channel(`sw-results-${eventId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'results', filter: `event_id=eq.${eventId}` },
        () => { fetchResults() }
      )
      .subscribe(status => setConnected(status === 'SUBSCRIBED'))

    const eventChannel = supabase
      .channel(`sw-event-${eventId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'events', filter: `id=eq.${eventId}` },
        payload => {
          const newIndex = (payload.new as Record<string, unknown>)?.current_start_index
          if (typeof newIndex === 'number') setStartIndex(newIndex)
          const newPhase = (payload.new as Record<string, unknown>)?.live_phase
          if (typeof newPhase === 'string' || newPhase === null) setLivePhase(newPhase as string | null)
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(resultsChannel)
      supabase.removeChannel(eventChannel)
    }
  }, [eventId, fetchResults, supabase])

  // Decode current + next 2 positions
  const current = decodeGlobalIndex(startIndex, activeSizeClasses, byCls)
  const next1 = decodeGlobalIndex(startIndex + 1, activeSizeClasses, byCls)
  const next2 = decodeGlobalIndex(startIndex + 2, activeSizeClasses, byCls)

  // Results map by participant_id
  const resultsMap: Record<string, SpeedwayResult> = {}
  for (const r of results) resultsMap[r.participant_id] = r

  if (participants.length === 0) return null

  // ── PODIUM SCREEN ─────────────────────────────────────────────────────────
  if (livePhase === 'podium') {
    const podiumClasses = SIZE_CLASSES.filter(cls =>
      results.some(r => r.size_class === cls && r.class_rank !== null)
    )
    return (
      <div className="space-y-8">
        <div className="flex justify-between items-center">
          <span className={`badge ${connected ? 'badge-green' : 'badge-yellow'}`}>
            {connected ? '● Na żywo' : '○ Łączenie...'}
          </span>
        </div>
        <div className="text-center py-6">
          <p className="text-5xl mb-2">🏆</p>
          <h2 className="text-2xl font-bold text-slate-800">Podium</h2>
        </div>
        {podiumClasses.map(cls => {
          const top3 = results
            .filter(r => r.size_class === cls && r.class_rank !== null)
            .sort((a, b) => (a.class_rank ?? 99) - (b.class_rank ?? 99))
            .slice(0, 3)
          if (top3.length === 0) return null
          return (
            <section key={cls}>
              <h3 className="text-center text-sm font-bold text-slate-500 uppercase tracking-widest mb-4">
                {SIZE_CLASS_LABELS[cls]}
              </h3>
              <div className="flex flex-col gap-3">
                {top3.map((r, i) => {
                  const p = participantsMap[r.participant_id]
                  const medals = ['🥇', '🥈', '🥉']
                  const bgColors = ['bg-yellow-50 border-yellow-300', 'bg-slate-50 border-slate-200', 'bg-orange-50 border-orange-200']
                  const textSizes = ['text-3xl', 'text-2xl', 'text-xl']
                  return (
                    <div key={r.participant_id} className={`card border-2 flex items-center gap-4 ${bgColors[i]}`}>
                      <span className="text-5xl shrink-0">{medals[i]}</span>
                      <div className="flex-1 min-w-0">
                        <p className={`font-bold text-slate-800 ${textSizes[i]} truncate`}>
                          {p?.dogName ?? '—'}
                        </p>
                        <p className="text-sm text-slate-500">{p?.ownerName ?? '—'}</p>
                      </div>
                      {r.best_ms !== null && (
                        <div className="text-right shrink-0">
                          <p className="font-mono font-bold text-sky-600 text-lg">{formatRunTime(r.best_ms)}</p>
                          <p className="text-xs text-slate-400">najlepszy</p>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </section>
          )
        })}
        {podiumClasses.length === 0 && (
          <p className="text-center text-slate-400">Trwa obliczanie wyników...</p>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Connection indicator */}
      <div className="flex justify-end">
        <span className={`badge ${connected ? 'badge-green' : 'badge-yellow'}`}>
          {connected ? '● Na żywo' : '○ Łączenie...'}
        </span>
      </div>

      {/* Current dog on start */}
      {current ? (
        <div>
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">
            🏁 Na starcie · Klasa {current.cls} · Runda {current.run}
          </h2>
          <div className="card border-2 border-green-400 bg-green-50">
            <div className="flex items-center gap-4">
              <span className="text-4xl">🐕</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-green-600 uppercase tracking-wide mb-0.5">
                  Aktualnie na starcie
                </p>
                <p className="text-2xl font-bold text-slate-800 truncate">
                  {current.participant.dogName ?? '—'}
                </p>
                <p className="text-sm text-slate-600">{current.participant.ownerName ?? '—'}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-3xl font-bold text-green-600">{current.dogInClass + 1}</p>
                <p className="text-xs text-slate-400">/ {byCls[current.cls]?.length ?? 0}</p>
              </div>
            </div>
          </div>

          {(next1 || next2) && (
            <div className="card bg-slate-50 mt-3">
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">
                Przygotowuje się
              </p>
              <div className="space-y-2">
                {([next1, next2] as const).filter(Boolean).map((n, i) =>
                  n ? (
                    <div key={i} className="flex items-center gap-3">
                      <span className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-600 shrink-0">
                        {n.dogInClass + 1}
                      </span>
                      <div>
                        <p className="font-medium text-slate-700 text-sm">
                          {n.participant.dogName ?? '—'}
                        </p>
                        <p className="text-xs text-slate-400">{n.participant.ownerName ?? '—'}</p>
                        {n.run !== current.run && (
                          <span className="text-xs font-semibold text-sky-500">
                            Runda {n.run}
                          </span>
                        )}
                      </div>
                    </div>
                  ) : null
                )}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="card text-center py-8 text-slate-400">
          <p className="text-3xl mb-2">🏁</p>
          <p className="font-medium">Wszyscy zawodnicy ukończyli</p>
        </div>
      )}

      {/* Live results per class — grouped by stored result.size_class */}
      {activeResultClasses.map(cls => {
        const clsResults = results
          .filter(r => r.size_class === cls && (
            r.run1_ms !== null || r.run1_status !== null ||
            r.run2_ms !== null || r.run2_status !== null
          ))
          .sort((a, b) => {
            const ra = a.class_rank ?? null
            const rb = b.class_rank ?? null
            if (ra !== null && rb !== null) return ra - rb
            const ba = a.best_ms ?? null
            const bb = b.best_ms ?? null
            if (ba !== null && bb !== null) return ba - bb
            if (ba !== null) return -1
            if (bb !== null) return 1
            return 0
          })
          .map(r => ({ r, p: participantsMap[r.participant_id] ?? null }))

        if (clsResults.length === 0) return null

        return (
          <section key={cls}>
            <h3 className="text-sm font-bold text-slate-600 uppercase tracking-wide mb-2">
              {SIZE_CLASS_LABELS[cls]}
            </h3>
            <div className="card p-0 overflow-hidden overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100 text-left">
                    <th className="px-4 py-2 w-8 text-xs font-semibold text-slate-400">#</th>
                    <th className="px-2 py-2 text-xs font-semibold text-slate-400">Pies</th>
                    <th className="px-2 py-2 text-xs font-semibold text-slate-400 text-right">R1</th>
                    <th className="px-2 py-2 text-xs font-semibold text-slate-400 text-right">R2</th>
                    <th className="px-4 py-2 text-xs font-semibold text-slate-400 text-right">Najlepszy</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {clsResults.map(({ p, r }, i) => {
                    const rank = r?.class_rank ?? i + 1
                    const hasFinalRank = r?.class_rank !== null
                    return (
                      <tr
                        key={r.participant_id}
                        className={i === 0 && hasFinalRank ? 'bg-yellow-50' : 'hover:bg-slate-50'}
                      >
                        <td className="px-4 py-3 font-bold text-slate-500 w-8">
                          {rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `${rank}.`}
                        </td>
                        <td className="px-2 py-3">
                          <p className="font-medium text-slate-800">{p?.dogName ?? '—'}</p>
                          <p className="text-xs text-slate-400">{p?.ownerName ?? '—'}</p>
                        </td>
                        <td className="px-2 py-3 font-mono text-right text-slate-600">
                          {timeDisplay(r?.run1_ms ?? null, r?.run1_status ?? null)}
                        </td>
                        <td className="px-2 py-3 font-mono text-right text-slate-600">
                          {timeDisplay(r?.run2_ms ?? null, r?.run2_status ?? null)}
                        </td>
                        <td className={`px-4 py-3 font-mono font-semibold text-right ${
                          r?.best_ms !== null ? 'text-sky-600' : 'text-slate-300'
                        }`}>
                          {timeDisplay(r?.best_ms ?? null, null)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )
      })}
    </div>
  )
}
