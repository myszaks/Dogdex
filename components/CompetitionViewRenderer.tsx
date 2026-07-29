'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { getSupabaseBrowserClient } from '@/lib/supabaseClient'
import type {
  CompetitionFormatDefinition,
  CompetitionScalar,
  CompetitionViewBlockDefinition,
} from '@/types/competition'
import {
  groupCompetitionResultsForBlock,
  sortCompetitionResultsForBlock,
} from '@/lib/competitionViews'

interface ParticipantSummary {
  participantId: string
  dogName: string | null
  ownerName: string | null
}

interface CalculatedResultRow {
  participant_id: string
  computed: Record<string, CompetitionScalar>
  groups: Record<string, string | null>
  ranks: Record<string, number | null>
  recalculated_at: string
  participants?: {
    dog_name: string | null
    owner_name: string | null
    dog_breed?: string | null
  } | Array<{
    dog_name: string | null
    owner_name: string | null
    dog_breed?: string | null
  }> | null
}

interface CompetitionLiveState {
  view_id: string | null
  phase: string | null
  current_participant_id: string | null
  cursor: number
  state: Record<string, CompetitionScalar>
}

interface Props {
  eventId: string
  definition: CompetitionFormatDefinition
  kind: 'live' | 'results'
  participants: ParticipantSummary[]
  initialResults: CalculatedResultRow[]
  initialLiveState: CompetitionLiveState | null
}

function formatMetric(
  definition: CompetitionFormatDefinition,
  path: string,
  value: CompetitionScalar | undefined,
) {
  if (value === null || value === undefined) return '—'
  const id = path.split('.').at(-1) ?? path
  const field = definition.computedFields.find(candidate => candidate.id === id)
  if (field?.type === 'duration_ms' && typeof value === 'number') {
    return `${(value / 1000).toFixed(field.precision ?? 2)} s`
  }
  if (typeof value === 'number') {
    const formatted = field?.precision === undefined ? String(value) : value.toFixed(field.precision)
    return field?.unit ? `${formatted} ${field.unit}` : formatted
  }
  if (typeof value === 'boolean') return value ? 'Tak' : 'Nie'
  return String(value)
}

function participantFromResult(result: CalculatedResultRow, participants: ParticipantSummary[]) {
  const known = participants.find(participant => participant.participantId === result.participant_id)
  const related = Array.isArray(result.participants)
    ? result.participants[0] ?? null
    : result.participants ?? null
  return {
    dogName: known?.dogName ?? related?.dog_name ?? null,
    ownerName: known?.ownerName ?? related?.owner_name ?? null,
  }
}

export default function CompetitionViewRenderer({
  eventId,
  definition,
  kind,
  participants,
  initialResults,
  initialLiveState,
}: Props) {
  const supabase = getSupabaseBrowserClient()
  const [results, setResults] = useState(initialResults)
  const [liveState, setLiveState] = useState(initialLiveState)
  const [connected, setConnected] = useState(false)
  const participantIds = useMemo(
    () => new Set(participants.map(participant => participant.participantId)),
    [participants],
  )
  const visibleResults = useMemo(
    () => results.filter(result => participantIds.has(result.participant_id)),
    [participantIds, results],
  )

  const view = useMemo(
    () => definition.views.find(candidate =>
      candidate.id === liveState?.view_id && candidate.kind === kind
    ) ?? definition.views.find(candidate => candidate.kind === kind),
    [definition.views, kind, liveState?.view_id],
  )

  const fetchResults = useCallback(async () => {
    if (!supabase) return
    const { data } = await supabase
      .from('competition_calculated_results')
      .select('participant_id, computed, groups, ranks, recalculated_at, participants(dog_name, owner_name, dog_breed)')
      .eq('event_id', eventId)
    if (data) setResults(data as CalculatedResultRow[])
  }, [eventId, supabase])

  const fetchLiveState = useCallback(async () => {
    if (!supabase) return
    const { data } = await supabase
      .from('competition_live_state')
      .select('view_id, phase, current_participant_id, cursor, state')
      .eq('event_id', eventId)
      .maybeSingle()
    if (data) setLiveState(data as CompetitionLiveState)
  }, [eventId, supabase])

  useEffect(() => {
    if (!supabase) return
    const resultsChannel = supabase
      .channel(`competition-calculated-${eventId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'competition_calculated_results',
          filter: `event_id=eq.${eventId}`,
        },
        fetchResults,
      )
      .subscribe(status => setConnected(status === 'SUBSCRIBED'))
    const liveChannel = supabase
      .channel(`competition-live-${eventId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'competition_live_state',
          filter: `event_id=eq.${eventId}`,
        },
        fetchLiveState,
      )
      .subscribe()

    return () => {
      supabase.removeChannel(resultsChannel)
      supabase.removeChannel(liveChannel)
    }
  }, [eventId, fetchLiveState, fetchResults, supabase])

  if (!view) {
    return (
      <div className="card py-12 text-center text-muted-foreground">
        Ten format nie ma skonfigurowanego widoku {kind === 'live' ? 'live' : 'wynikowego'}.
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {kind === 'live' && (
        <div className="flex justify-end">
          <span className={`badge ${connected ? 'badge-green' : 'badge-yellow'}`}>
            {connected ? '● Na żywo' : '○ Łączenie…'}
          </span>
        </div>
      )}
      {view.blocks.map(block => (
        <CompetitionViewBlock
          key={block.id}
          block={block}
          definition={definition}
          participants={participants}
          results={visibleResults}
          liveState={liveState}
        />
      ))}
    </div>
  )
}

function CompetitionViewBlock({
  block,
  definition,
  participants,
  results,
  liveState,
}: {
  block: CompetitionViewBlockDefinition
  definition: CompetitionFormatDefinition
  participants: ParticipantSummary[]
  results: CalculatedResultRow[]
  liveState: CompetitionLiveState | null
}) {
  const ordered = sortCompetitionResultsForBlock(results, block)
  const resultGroups = groupCompetitionResultsForBlock(definition, results, block)
  const limited = block.limit ? ordered.slice(0, block.limit) : ordered
  const currentIndex = liveState?.current_participant_id
    ? participants.findIndex(participant => participant.participantId === liveState.current_participant_id)
    : liveState?.cursor ?? 0
  const current = participants[currentIndex] ?? null

  if (block.type === 'current_entry') {
    return (
      <section>
        <BlockTitle title={block.title} />
        <div className="card border-2 border-green-300 bg-green-50 p-6">
          {current ? (
            <>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-green-700">Aktualnie</p>
              <p className="mt-2 text-2xl font-bold text-foreground">{current.dogName ?? '—'}</p>
              <p className="text-sm text-muted-foreground">{current.ownerName ?? '—'}</p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Oczekiwanie na wskazanie zawodnika.</p>
          )}
        </div>
      </section>
    )
  }

  if (block.type === 'next_up') {
    const upcoming = participants.slice(Math.max(0, currentIndex + 1), currentIndex + 1 + (block.limit ?? 5))
    return (
      <section>
        <BlockTitle title={block.title} />
        <div className="card divide-y divide-sage-100 p-0">
          {upcoming.length > 0 ? upcoming.map((participant, index) => (
            <div key={participant.participantId} className="flex items-center gap-3 px-4 py-3">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-secondary text-xs font-bold">
                {index + 1}
              </span>
              <div>
                <p className="font-medium">{participant.dogName ?? '—'}</p>
                <p className="text-xs text-muted-foreground">{participant.ownerName ?? '—'}</p>
              </div>
            </div>
          )) : <p className="p-4 text-sm text-muted-foreground">Brak kolejnych zawodników.</p>}
        </div>
      </section>
    )
  }

  if (block.type === 'progress') {
    const completed = results.filter(result =>
      Object.values(result.ranks).some(rank => rank !== null)
    ).length
    const percent = participants.length > 0 ? Math.round((completed / participants.length) * 100) : 0
    return (
      <section className="card">
        <div className="mb-2 flex justify-between text-sm">
          <span className="font-semibold">{block.title ?? 'Postęp'}</span>
          <span className="text-muted-foreground">{completed}/{participants.length}</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-sage-100">
          <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${percent}%` }} />
        </div>
      </section>
    )
  }

  if (block.type === 'message') {
    const message = liveState?.state.message ?? block.options?.message
    if (!message) return null
    return <div className="card border-sky-200 bg-sky-50 text-center font-medium text-sky-800">{String(message)}</div>
  }

  if (block.type === 'metric') {
    const fieldPath = block.fields?.[0]
    const leader = limited[0]
    const participant = leader ? participantFromResult(leader, participants) : null
    return (
      <section>
        <BlockTitle title={block.title} />
        <div className="card text-center">
          <p className="text-3xl font-bold text-accent">
            {fieldPath && leader
              ? formatMetric(definition, fieldPath, leader.computed[fieldPath.split('.').at(-1) ?? fieldPath])
              : '—'}
          </p>
          {participant && <p className="mt-2 text-sm text-muted-foreground">{participant.dogName}</p>}
        </div>
      </section>
    )
  }

  if (block.type === 'podium') {
    return (
      <section>
        <BlockTitle title={block.title ?? 'Podium'} />
        <div className="space-y-5">
          {resultGroups.map(group => {
            const ranked = group.rows.filter(result =>
              block.rankingId && result.ranks[block.rankingId] !== null
            ).slice(0, block.limit ?? 3)
            if (ranked.length === 0) return null
            return (
              <div key={group.key}>
                {group.title && (
                  <h3 className="mb-3 text-sm font-bold uppercase tracking-[0.12em] text-sage-600">
                    {group.title}
                  </h3>
                )}
                <div className="grid gap-3 sm:grid-cols-3">
                  {ranked.map(result => {
                    const participant = participantFromResult(result, participants)
                    const rank = block.rankingId ? result.ranks[block.rankingId] : null
                    return (
                      <div key={result.participant_id} className="card text-center">
                        <p className="text-3xl">{rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`}</p>
                        <p className="mt-2 font-bold">{participant.dogName ?? '—'}</p>
                        <p className="text-xs text-muted-foreground">{participant.ownerName ?? '—'}</p>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </section>
    )
  }

  if (block.type === 'leaderboard' || block.type === 'result_table') {
    const fields = block.fields ?? definition.computedFields.map(field => `computed.${field.id}`)
    return (
      <section>
        <BlockTitle title={block.title} />
        <div className="space-y-5">
          {resultGroups.map(group => {
            const groupRows = block.limit ? group.rows.slice(0, block.limit) : group.rows
            return (
              <div key={group.key}>
                {group.title && (
                  <h3 className="mb-3 text-sm font-bold uppercase tracking-[0.12em] text-sage-600">
                    {group.title}
                  </h3>
                )}
                <div className="card overflow-x-auto p-0">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-sage-100 bg-sage-50 text-left text-xs text-muted-foreground">
                        <th className="px-4 py-3">#</th>
                        <th className="px-4 py-3">Zawodnik</th>
                        {fields.map(path => (
                          <th key={path} className="px-4 py-3 text-right">
                            {definition.computedFields.find(field => field.id === path.split('.').at(-1))?.label ?? path}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-sage-100">
                      {groupRows.map(result => {
                        const participant = participantFromResult(result, participants)
                        return (
                          <tr key={result.participant_id}>
                            <td className="px-4 py-3 font-bold">
                              {block.rankingId ? result.ranks[block.rankingId] ?? '—' : '—'}
                            </td>
                            <td className="px-4 py-3">
                              <p className="font-medium">{participant.dogName ?? '—'}</p>
                              <p className="text-xs text-muted-foreground">{participant.ownerName ?? '—'}</p>
                            </td>
                            {fields.map(path => {
                              const fieldId = path.split('.').at(-1) ?? path
                              return (
                                <td key={path} className="px-4 py-3 text-right font-mono font-semibold">
                                  {formatMetric(definition, path, result.computed[fieldId])}
                                </td>
                              )
                            })}
                          </tr>
                        )
                      })}
                      {groupRows.length === 0 && (
                        <tr><td colSpan={fields.length + 2} className="px-4 py-10 text-center text-muted-foreground">Oczekiwanie na wyniki.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })}
          {resultGroups.length === 0 && (
            <div className="card py-10 text-center text-muted-foreground">
              Oczekiwanie na wyniki.
            </div>
          )}
        </div>
      </section>
    )
  }

  return null
}

function BlockTitle({ title }: { title?: string }) {
  if (!title) return null
  return <h2 className="mb-3 font-heading text-lg font-bold text-foreground">{title}</h2>
}
