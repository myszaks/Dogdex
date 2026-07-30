'use client'
import { useState } from 'react'

interface ParticipantWithResult {
  id: string
  dog_name: string | null
  owner_name: string | null
  dog_breed: string | null
  result: {
    id: string
    time_ms: number | null
    rank: number | null
    notes: string | null
  } | null
}

interface Props {
  eventId: string
  participants: ParticipantWithResult[]
}

interface RowState {
  participantId: string
  dogName: string
  ownerName: string
  breed: string
  resultId: string | null
  timeInput: string
  rank: string
  notes: string
  saved: boolean
  saving: boolean
  error: string | null
}

export default function ResultsForm({ eventId, participants }: Props) {
  const [rows, setRows] = useState<RowState[]>(
    participants.map(p => ({
      participantId: p.id,
      dogName: p.dog_name ?? '',
      ownerName: p.owner_name ?? '',
      breed: p.dog_breed ?? '',
      resultId: p.result?.id ?? null,
      timeInput:
        p.result?.time_ms != null
          ? (p.result.time_ms / 1000).toFixed(2)
          : '',
      rank: p.result?.rank?.toString() ?? '',
      notes: p.result?.notes ?? '',
      saved: p.result != null,
      saving: false,
      error: null,
    }))
  )

  function updateRow(index: number, field: keyof RowState, value: string) {
    setRows(prev => {
      const next = [...prev]
      next[index] = { ...next[index], [field]: value, saved: false, error: null }
      return next
    })
  }

  function autoRank() {
    setRows(prev => {
      const withTime = prev
        .map((r, i) => ({ i, time: parseFloat(r.timeInput) }))
        .filter(x => !isNaN(x.time))
        .sort((a, b) => a.time - b.time)

      const next = [...prev]
      // Clear all ranks first
      next.forEach((_, idx) => { next[idx] = { ...next[idx], rank: '', saved: false } })
      // Assign ranks by time order
      withTime.forEach(({ i }, rankIdx) => {
        next[i] = { ...next[i], rank: String(rankIdx + 1), saved: false }
      })
      return next
    })
  }

  async function saveRow(index: number) {
    const row = rows[index]
    setRows(prev => {
      const next = [...prev]
      next[index] = { ...next[index], saving: true, error: null }
      return next
    })

    const timeMs =
      row.timeInput.trim() !== ''
        ? Math.round(parseFloat(row.timeInput) * 1000)
        : null
    const rank = row.rank.trim() !== '' ? parseInt(row.rank, 10) : null

    try {
      const res = await fetch('/api/results', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          eventId,
          participantId: row.participantId,
          resultId: row.resultId,
          time_ms: timeMs,
          rank,
          notes: row.notes || null,
        }),
      })

      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Błąd serwera')

      setRows(prev => {
        const next = [...prev]
        next[index] = {
          ...next[index],
          saving: false,
          saved: true,
          resultId: json.id,
        }
        return next
      })
    } catch (err: unknown) {
      setRows(prev => {
        const next = [...prev]
        next[index] = {
          ...next[index],
          saving: false,
          error: err instanceof Error ? err.message : 'Błąd',
        }
        return next
      })
    }
  }

  if (participants.length === 0) {
    return (
      <div className="card text-center py-12 text-slate-500">
        <p className="text-3xl mb-3">👥</p>
        <p>Brak potwierdzonych uczestników</p>
        <p className="text-sm mt-1 text-slate-400">
          Potwierdź zapisy w zakładce Zapisy, żeby móc wpisywać wyniki.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={autoRank}
          className="btn btn-secondary btn-sm"
          title="Sortuje uczestników wg czasu i przypisuje miejsca"
        >
          🏆 Auto-rankuj wg czasu
        </button>
      </div>
      {rows.map((row, i) => (
        <div key={row.participantId} className="card">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="font-semibold text-slate-800">🐕 {row.dogName}</p>
              <p className="text-sm text-slate-500">
                👤 {row.ownerName}
                {row.breed && ` · ${row.breed}`}
              </p>
            </div>
            {row.saved && (
              <span className="badge badge-green">✓ Zapisano</span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3">
            <div>
              <label htmlFor={`result-rank-${row.participantId}`} className="form-label">Miejsce</label>
              <input
                id={`result-rank-${row.participantId}`}
                className="form-input"
                type="number"
                min="1"
                placeholder="1"
                value={row.rank}
                onChange={e => updateRow(i, 'rank', e.target.value)}
              />
            </div>
            <div>
              <label htmlFor={`result-time-${row.participantId}`} className="form-label">Czas (s)</label>
              <input
                id={`result-time-${row.participantId}`}
                className="form-input"
                type="number"
                step="0.01"
                min="0"
                placeholder="12.34"
                value={row.timeInput}
                onChange={e => updateRow(i, 'timeInput', e.target.value)}
                aria-describedby={row.error ? `result-error-${row.participantId}` : undefined}
              />
            </div>
            <div>
              <label htmlFor={`result-notes-${row.participantId}`} className="form-label">Uwagi</label>
              <input
                id={`result-notes-${row.participantId}`}
                className="form-input"
                placeholder="np. dyskwal."
                value={row.notes}
                onChange={e => updateRow(i, 'notes', e.target.value)}
              />
            </div>
          </div>

          {row.error && (
            <p id={`result-error-${row.participantId}`} role="alert" className="text-red-600 text-xs mb-2">⚠️ {row.error}</p>
          )}

          <button
            onClick={() => saveRow(i)}
            disabled={row.saving}
            className="btn btn-primary btn-sm w-full"
          >
            {row.saving ? 'Zapisywanie...' : row.resultId ? '↻ Aktualizuj wynik' : '+ Zapisz wynik'}
          </button>
        </div>
      ))}
    </div>
  )
}
