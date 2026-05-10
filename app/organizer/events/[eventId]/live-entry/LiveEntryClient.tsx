'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface ParticipantInfo {
  id: string
  dog_name: string | null
  owner_name: string | null
  dog_breed: string | null
  result: { id: string; time_ms: number | null; notes: string | null } | null
}

interface Props {
  eventId: string
  currentIndex: number
  current: ParticipantInfo | null
  next: ParticipantInfo | null
  totalCount: number
}

export default function LiveEntryClient({
  eventId,
  currentIndex,
  current,
  next,
  totalCount,
}: Props) {
  const router = useRouter()
  const [timeInput, setTimeInput] = useState(
    current?.result?.time_ms != null ? (current.result.time_ms / 1000).toFixed(2) : ''
  )
  const [notes, setNotes] = useState(current?.result?.notes ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave(andNext: boolean) {
    if (!current) return
    setSaving(true)
    setError(null)

    const time_ms = timeInput.trim() ? Math.round(parseFloat(timeInput) * 1000) : null

    const res = await fetch('/api/results', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventId,
        participantId: current.id,
        resultId: current.result?.id ?? null,
        time_ms,
        rank: null,
        notes: notes.trim() || null,
      }),
    })

    if (!res.ok) {
      const d = await res.json()
      setError(d.error ?? 'Błąd zapisu')
      setSaving(false)
      return
    }

    if (andNext) {
      await fetch(`/api/events/${eventId}/start-index`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'next' }),
      })
    }

    setSaving(false)
    router.refresh()
  }

  if (!current) {
    return (
      <div className="card text-center py-12">
        <p className="text-5xl mb-3">🏁</p>
        <p className="text-slate-600 font-semibold text-lg">Wszyscy zawodnicy ukończyli!</p>
        <p className="text-sm text-slate-400 mt-1">
          Zawodnicy: {totalCount} | Indeks: {currentIndex}
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Current participant card */}
      <div className="card border-2 border-green-400 bg-green-50 space-y-4">
        <div className="flex items-start gap-4">
          <span className="text-5xl">🐕</span>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-green-600 font-medium uppercase tracking-wide">
              Nr {currentIndex + 1} / {totalCount}
            </p>
            <p className="text-2xl font-bold text-slate-800 leading-tight mt-0.5">
              {current.dog_name ?? '—'}
            </p>
            <p className="text-slate-600">{current.owner_name ?? '—'}</p>
            {current.dog_breed && (
              <p className="text-xs text-slate-400 mt-0.5">{current.dog_breed}</p>
            )}
          </div>
        </div>

        <div>
          <label className="form-label">Czas (sekundy, np. 45.32)</label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={timeInput}
            onChange={e => setTimeInput(e.target.value)}
            placeholder="—"
            className="form-input font-mono text-2xl"
            autoFocus
          />
        </div>

        <div>
          <label className="form-label">Uwagi</label>
          <input
            type="text"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="opcjonalnie"
            className="form-input"
          />
        </div>

        {error && <p className="text-sm text-red-600 font-medium">{error}</p>}

        <div className="flex gap-2">
          <button
            onClick={() => handleSave(false)}
            disabled={saving}
            className="btn btn-secondary flex-1"
          >
            {saving ? '...' : '💾 Zapisz'}
          </button>
          <button
            onClick={() => handleSave(true)}
            disabled={saving}
            className="btn btn-primary flex-1"
          >
            {saving ? '...' : '✅ Zapisz i następny →'}
          </button>
        </div>
      </div>

      {/* Next participant preview */}
      {next && (
        <div className="card bg-slate-50">
          <p className="text-xs text-slate-400 uppercase tracking-wide font-medium mb-1">Następny</p>
          <p className="font-medium text-slate-700">{next.dog_name ?? '—'}</p>
          <p className="text-sm text-slate-500">{next.owner_name ?? '—'}</p>
        </div>
      )}
    </div>
  )
}
