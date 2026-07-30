'use client'

import { useMemo, useState } from 'react'
import { CheckCircle2, Search } from 'lucide-react'
import type {
  CompetitionFormatDefinition,
  CompetitionScalar,
} from '@/types/competition'
import { resultFieldsForStage } from '@/lib/competitionStages'

interface Participant {
  participantId: string
  dogName: string
  ownerName: string
}

interface StoredEntry {
  id: string
  participant_id: string
  stage_id: string
  attempt_id: string
  status: string | null
  values: Record<string, CompetitionScalar>
}

interface Props {
  eventId: string
  definition: CompetitionFormatDefinition
  participants: Participant[]
  initialEntries: StoredEntry[]
}

interface EntryState {
  id: string | null
  status: string | null
  values: Record<string, CompetitionScalar>
  saving: boolean
  saved: boolean
  error: string | null
}

function entryKey(participantId: string, stageId: string, attemptId: string) {
  return `${participantId}\u001f${stageId}\u001f${attemptId}`
}

export default function CompetitionResultEntry({
  eventId,
  definition,
  participants,
  initialEntries,
}: Props) {
  const attempts = definition.stages.flatMap(stage =>
    stage.attempts.map(attempt => ({
      stageId: stage.id,
      stageLabel: stage.label,
      attemptId: attempt.id,
      attemptLabel: attempt.label,
    }))
  )
  const [selectedAttempt, setSelectedAttempt] = useState(attempts[0] ?? null)
  const [entries, setEntries] = useState<Record<string, EntryState>>(() => {
    const initial: Record<string, EntryState> = {}
    for (const entry of initialEntries) {
      initial[entryKey(entry.participant_id, entry.stage_id, entry.attempt_id)] = {
        id: entry.id,
        status: entry.status,
        values: entry.values ?? {},
        saving: false,
        saved: false,
        error: null,
      }
    }
    return initial
  })
  const [currentParticipantId, setCurrentParticipantId] = useState<string | null>(
    participants[0]?.participantId ?? null
  )
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'pending' | 'completed'>('all')
  const activeResultFields = selectedAttempt
    ? resultFieldsForStage(definition, selectedAttempt.stageId)
    : []

  const activeKey = (participantId: string) => selectedAttempt
    ? entryKey(participantId, selectedAttempt.stageId, selectedAttempt.attemptId)
    : ''
  const completed = useMemo(() => {
    if (!selectedAttempt) return 0
    return participants.filter(participant => {
      const entry = entries[activeKey(participant.participantId)]
      return isEntryComplete(activeResultFields, entry)
    }).length
  }, [entries, participants, selectedAttempt]) // eslint-disable-line react-hooks/exhaustive-deps
  const visibleParticipants = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase('pl')
    return participants.filter(participant => {
      const matchesSearch = !normalizedSearch
        || participant.dogName.toLocaleLowerCase('pl').includes(normalizedSearch)
        || participant.ownerName.toLocaleLowerCase('pl').includes(normalizedSearch)
      const complete = isEntryComplete(
        activeResultFields,
        entries[activeKey(participant.participantId)],
      )
      const matchesFilter = filter === 'all'
        || (filter === 'completed' && complete)
        || (filter === 'pending' && !complete)
      return matchesSearch && matchesFilter
    })
  }, [definition, entries, filter, participants, search, selectedAttempt]) // eslint-disable-line react-hooks/exhaustive-deps

  function getEntry(participantId: string): EntryState {
    return entries[activeKey(participantId)] ?? {
      id: null,
      status: null,
      values: {},
      saving: false,
      saved: false,
      error: null,
    }
  }

  function patchEntry(participantId: string, patch: Partial<EntryState>) {
    const key = activeKey(participantId)
    setEntries(current => ({
      ...current,
      [key]: { ...getEntryFrom(current, key), ...patch },
    }))
  }

  async function saveEntry(participantId: string): Promise<boolean> {
    if (!selectedAttempt) return false
    const entry = getEntry(participantId)
    patchEntry(participantId, { saving: true, saved: false, error: null })
    try {
      const response = await fetch(`/api/events/${eventId}/competition-results`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          participantId,
          stageId: selectedAttempt.stageId,
          attemptId: selectedAttempt.attemptId,
          status: entry.status,
          values: Object.fromEntries(
            activeResultFields.map(field => [field.id, entry.values[field.id]])
              .filter(([, value]) => value !== undefined),
          ),
        }),
      })
      const json = await response.json()
      if (!response.ok) {
        const issue = Array.isArray(json.issues) && json.issues[0]
          ? ` ${json.issues[0].path}: ${json.issues[0].message}`
          : ''
        throw new Error(`${json.error ?? 'Nie udało się zapisać wyniku.'}${issue}`)
      }
      patchEntry(participantId, {
        id: json.entry?.id ?? entry.id,
        saving: false,
        saved: true,
      })
      return true
    } catch (err) {
      patchEntry(participantId, {
        saving: false,
        error: err instanceof Error ? err.message : 'Nie udało się zapisać wyniku.',
      })
      return false
    }
  }

  async function saveAndNext(participantId: string) {
    const saved = await saveEntry(participantId)
    if (!saved) return
    const currentIndex = participants.findIndex(participant =>
      participant.participantId === participantId
    )
    const nextParticipant = participants[currentIndex + 1]
    if (nextParticipant) await setCurrentParticipant(nextParticipant.participantId)
  }

  async function setCurrentParticipant(participantId: string) {
    const cursor = participants.findIndex(participant => participant.participantId === participantId)
    setCurrentParticipantId(participantId)
    await fetch(`/api/events/${eventId}/competition-live-state`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        currentParticipantId: participantId,
        cursor: Math.max(0, cursor),
        currentStageId: selectedAttempt?.stageId ?? null,
        currentAttemptId: selectedAttempt?.attemptId ?? null,
      }),
    })
  }

  if (!selectedAttempt) {
    return <div className="card text-sm text-muted-foreground">Format nie zawiera żadnych prób.</div>
  }

  return (
    <div className="space-y-5">
      <div className="card sticky top-2 z-20 bg-sage-50/95 shadow-sm backdrop-blur">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <label htmlFor="competition-current-attempt" className="block min-w-64">
            <span className="form-label">Aktualna próba</span>
            <select
              id="competition-current-attempt"
              className="form-input min-h-11"
              value={`${selectedAttempt.stageId}\u001f${selectedAttempt.attemptId}`}
              onChange={event => {
                const [stageId, attemptId] = event.target.value.split('\u001f')
                setSelectedAttempt(attempts.find(attempt =>
                  attempt.stageId === stageId && attempt.attemptId === attemptId
                ) ?? attempts[0])
              }}
            >
              {attempts.map(attempt => (
                <option
                  key={`${attempt.stageId}-${attempt.attemptId}`}
                  value={`${attempt.stageId}\u001f${attempt.attemptId}`}
                >
                  {attempt.stageLabel} · {attempt.attemptLabel}
                </option>
              ))}
            </select>
          </label>
          <p className="text-sm font-semibold text-sage-700">
            Uzupełniono {completed}/{participants.length}
          </p>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(220px,1fr)_auto]">
          <label htmlFor="competition-participant-search" className="relative block">
            <span className="sr-only">Szukaj psa lub właściciela</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-sage-500" />
            <input
              id="competition-participant-search"
              className="form-input min-h-11 pl-10"
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder="Szukaj psa lub właściciela…"
            />
          </label>
          <div className="flex rounded-xl border border-sage-200 bg-white p-1" aria-label="Filtr uczestników">
            {([
              ['all', 'Wszyscy'],
              ['pending', 'Do wpisania'],
              ['completed', 'Gotowe'],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setFilter(value)}
                className={`min-h-9 rounded-lg px-3 text-xs font-semibold ${
                  filter === value ? 'bg-primary text-white' : 'text-sage-600 hover:bg-sage-50'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {visibleParticipants.map(participant => {
          const entry = getEntry(participant.participantId)
          return (
            <article
              key={participant.participantId}
              className={`rounded-2xl border p-4 ${
                currentParticipantId === participant.participantId
                  ? 'border-green-300 bg-green-50/50'
                  : 'border-sage-200 bg-card'
              }`}
            >
              <div className="flex flex-col gap-4 xl:flex-row xl:items-end">
                <div className="min-w-48 flex-1">
                  <p className="font-bold text-foreground">{participant.dogName || '—'}</p>
                  <p className="text-xs text-muted-foreground">{participant.ownerName || '—'}</p>
                  <button
                    type="button"
                    onClick={() => setCurrentParticipant(participant.participantId)}
                    className="mt-2 min-h-10 rounded-xl px-3 text-xs font-semibold text-accent hover:bg-orange-50"
                  >
                    {currentParticipantId === participant.participantId ? '● Na starcie' : 'Ustaw na starcie'}
                  </button>
                </div>

                <div className="grid flex-[2] gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {activeResultFields.map(field => (
                    <label
                      key={field.id}
                      htmlFor={`competition-result-${participant.participantId}-${field.id}`}
                    >
                      <span className="form-label text-xs">
                        {field.label}
                        {field.unit && field.type !== 'duration_ms' ? ` (${field.unit})` : ''}
                        {field.type === 'duration_ms' ? ' (sekundy)' : ''}
                      </span>
                      {field.type === 'boolean' ? (
                        <input
                          id={`competition-result-${participant.participantId}-${field.id}`}
                          type="checkbox"
                          checked={entry.values[field.id] === true}
                          disabled={entry.status !== null}
                          onChange={event => patchEntry(participant.participantId, {
                            values: { ...entry.values, [field.id]: event.target.checked },
                            saved: false,
                          })}
                          className="h-10 w-5"
                        />
                      ) : (
                        <input
                          id={`competition-result-${participant.participantId}-${field.id}`}
                          className="form-input"
                          type={field.type === 'text' ? 'text' : 'number'}
                          min={field.type === 'duration_ms' && field.min !== undefined
                            ? field.min / 1000
                            : field.min}
                          max={field.type === 'duration_ms' && field.max !== undefined
                            ? field.max / 1000
                            : field.max}
                          step={field.type === 'duration_ms'
                            ? 10 ** -(field.precision ?? 2)
                            : field.precision !== undefined
                              ? 10 ** -field.precision
                              : 'any'}
                          value={
                            entry.values[field.id] === null || entry.values[field.id] === undefined
                              ? ''
                              : field.type === 'duration_ms' && typeof entry.values[field.id] === 'number'
                                ? String((entry.values[field.id] as number) / 1000)
                                : String(entry.values[field.id])
                          }
                          disabled={entry.status !== null}
                          onChange={event => {
                            let value: CompetitionScalar = event.target.value
                            if (field.type === 'number') value = event.target.value === '' ? null : Number(event.target.value)
                            if (field.type === 'duration_ms') {
                              value = event.target.value === '' ? null : Math.round(Number(event.target.value) * 1000)
                            }
                            patchEntry(participant.participantId, {
                              values: { ...entry.values, [field.id]: value },
                              saved: false,
                            })
                          }}
                        />
                      )}
                    </label>
                  ))}
                  <label htmlFor={`competition-status-${participant.participantId}`}>
                    <span className="form-label text-xs">Status</span>
                    <select
                      id={`competition-status-${participant.participantId}`}
                      className="form-input"
                      value={entry.status ?? ''}
                      onChange={event => patchEntry(participant.participantId, {
                        status: event.target.value || null,
                        saved: false,
                      })}
                    >
                      <option value="">Prawidłowy</option>
                      {definition.statuses.map(status => (
                        <option key={status.id} value={status.id}>{status.label}</option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="flex flex-col gap-2 sm:flex-row xl:flex-col">
                  <button
                    type="button"
                    onClick={() => saveEntry(participant.participantId)}
                    disabled={entry.saving}
                    className="btn btn-secondary min-h-11 min-w-28"
                  >
                    {entry.saving ? 'Zapisuję…' : entry.saved ? '✓ Zapisano' : 'Zapisz'}
                  </button>
                  <button
                    type="button"
                    onClick={() => saveAndNext(participant.participantId)}
                    disabled={entry.saving}
                    className="btn btn-primary min-h-11 whitespace-nowrap"
                  >
                    Zapisz i następny
                  </button>
                </div>
              </div>
              {entry.error && <p className="mt-3 text-xs text-red-600">{entry.error}</p>}
            </article>
          )
        })}
        {visibleParticipants.length === 0 && (
          <div className="rounded-2xl border border-dashed border-sage-300 bg-sage-50 p-8 text-center">
            <CheckCircle2 className="mx-auto mb-2 h-6 w-6 text-sage-500" />
            <p className="font-semibold text-primary">
              {filter === 'pending' && completed === participants.length
                ? 'Wszystkie wyniki tej próby są uzupełnione.'
                : 'Brak uczestników pasujących do filtra.'}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

function isEntryComplete(
  resultFields: CompetitionFormatDefinition['resultFields'],
  entry: EntryState | undefined,
): boolean {
  if (!entry || !entry.id) return false
  if (entry.status !== null) return true
  return resultFields
    .filter(field => field.required)
    .every(field => {
      const value = entry.values[field.id]
      return value !== null && value !== undefined && value !== ''
    })
}

function getEntryFrom(entries: Record<string, EntryState>, key: string): EntryState {
  return entries[key] ?? {
    id: null,
    status: null,
    values: {},
    saving: false,
    saved: false,
    error: null,
  }
}
