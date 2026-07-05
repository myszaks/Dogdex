'use client'
import { useState } from 'react'
import {
  SIZE_CLASSES,
  SIZE_CLASS_LABELS,
  getSizeClass,
  computeStoredSpeedKmh,
  formatRunTime,
  isValidTrackDistanceM,
  parseRunMs,
  bestMs as computeBest,
  medalEmoji,
  TRACK_DISTANCE_MAX_M,
  TRACK_DISTANCE_MIN_M,
} from '@/lib/speedway'
import type { SizeClass } from '@/lib/speedway'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SpeedwayParticipant {
  participantId: string
  dogName: string
  ownerName: string
  breed: string
  heightCm: number | null
  result: {
    id: string
    run1_ms: number | null
    run2_ms: number | null
    best_ms: number | null
    speed_kmh: number | null
    size_class: string | null
    class_rank: number | null
  } | null
}

interface Props {
  eventId: string
  initialTrackDistanceM: number | null
  participants: SpeedwayParticipant[]
}

interface RowState {
  participantId: string
  dogName: string
  ownerName: string
  breed: string
  heightCm: number | null
  sizeClass: SizeClass
  resultId: string | null
  run1: string
  run2: string
  classRank: number | null
  saved: boolean
  saving: boolean
  error: string | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function msToInput(ms: number | null): string {
  return ms !== null ? (ms / 1000).toFixed(2) : ''
}

function defaultClass(p: SpeedwayParticipant): SizeClass {
  if (p.heightCm !== null) return getSizeClass(p.heightCm)
  // Fall back to stored size_class if no height
  if (p.result?.size_class && SIZE_CLASSES.includes(p.result.size_class as SizeClass)) {
    return p.result.size_class as SizeClass
  }
  return 'M' // sensible default – organizer will correct
}

function rowBestMs(row: RowState): number | null {
  return computeBest(parseRunMs(row.run1), parseRunMs(row.run2))
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SpeedwayResultsForm({ eventId, initialTrackDistanceM, participants }: Props) {
  const [rows, setRows] = useState<RowState[]>(
    participants.map(p => ({
      participantId: p.participantId,
      dogName: p.dogName,
      ownerName: p.ownerName,
      breed: p.breed,
      heightCm: p.heightCm,
      sizeClass: defaultClass(p),
      resultId: p.result?.id ?? null,
      run1: msToInput(p.result?.run1_ms ?? null),
      run2: msToInput(p.result?.run2_ms ?? null),
      classRank: p.result?.class_rank ?? null,
      saved: p.result !== null,
      saving: false,
      error: null,
    }))
  )

  const [trackDistance, setTrackDistance] = useState(
    initialTrackDistanceM !== null ? String(initialTrackDistanceM) : ''
  )
  const [savingDistance, setSavingDistance] = useState(false)
  const [distanceSaved, setDistanceSaved] = useState(initialTrackDistanceM !== null)

  const [recalculating, setRecalculating] = useState(false)
  const [recalcMsg, setRecalcMsg] = useState<string | null>(null)

  const distanceM = parseFloat(trackDistance) || null
  const distanceValid = isValidTrackDistanceM(trackDistance)
  const canEditDistance = !distanceSaved || !distanceValid

  // ── Track distance save ────────────────────────────────────────────────────

  async function saveDistance() {
    if (!canEditDistance) return
    const val = parseFloat(trackDistance)
    if (!isValidTrackDistanceM(val)) return
    setSavingDistance(true)
    try {
      await fetch(`/api/events/${eventId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ track_distance_m: val }),
      })
      setDistanceSaved(true)
    } finally {
      setSavingDistance(false)
    }
  }

  // ── Row helpers ───────────────────────────────────────────────────────────

  function updateRow(idx: number, patch: Partial<RowState>) {
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, ...patch, saved: false, error: null } : r))
  }

  // ── Save single participant ────────────────────────────────────────────────

  async function saveRow(idx: number) {
    const row = rows[idx]
    const r1 = parseRunMs(row.run1)
    const r2 = parseRunMs(row.run2)

    if (r1 === null && r2 === null) {
      updateRow(idx, { error: 'Podaj co najmniej jeden czas przebiegu' })
      return
    }

    updateRow(idx, { saving: true, error: null })

    try {
      const res = await fetch('/api/results', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId,
          participantId: row.participantId,
          resultId: row.resultId,
          run1_ms: r1,
          run2_ms: r2,
          size_class: row.sizeClass,
          track_distance_m: distanceM,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Błąd serwera')

      setRows(prev => prev.map((r, i) =>
        i === idx
          ? { ...r, saving: false, saved: true, resultId: json.id, classRank: json.class_rank ?? r.classRank }
          : r
      ))
    } catch (err) {
      updateRow(idx, { saving: false, error: err instanceof Error ? err.message : 'Błąd' })
    }
  }

  // ── Recalculate class ranks ────────────────────────────────────────────────

  async function recalculateRanks() {
    setRecalculating(true)
    setRecalcMsg(null)
    try {
      const res = await fetch(`/api/events/${eventId}/recalculate-ranks`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Błąd')

      // Refresh ranks from server
      const r2 = await fetch(`/api/results?eventId=${eventId}`)
      const updated: any[] = await r2.json()
      setRows(prev => prev.map(row => {
        const serverResult = updated.find(u => u.participant_id === row.participantId)
        return serverResult ? { ...row, classRank: serverResult.class_rank ?? null } : row
      }))
      setRecalcMsg(`✅ Przeliczono miejsca (${json.updated} wyników)`)
    } catch (err) {
      setRecalcMsg(`❌ ${err instanceof Error ? err.message : 'Błąd'}`)
    } finally {
      setRecalculating(false)
    }
  }

  // ── Grouped view ──────────────────────────────────────────────────────────

  const noParticipants = participants.length === 0

  // Overall stats (fastest / slowest with at least run1 or best)
  const withBest = rows
    .map(r => ({ row: r, best: rowBestMs(r) }))
    .filter(x => x.best !== null)
    .sort((a, b) => (a.best as number) - (b.best as number))

  const fastest = withBest[0] ?? null
  const slowest = withBest[withBest.length - 1] ?? null

  // ─────────────────────────────────────────────────────────────────────────

  if (noParticipants) {
    return (
      <div className="card text-center py-12 text-slate-500">
        <p className="text-3xl mb-3">👥</p>
        <p>Brak potwierdzonych uczestników</p>
        <p className="text-sm mt-1 text-slate-400">Potwierdź zapisy w zakładce Zapisy, żeby móc wpisywać wyniki.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">

      {/* ── Track distance ── */}
      <div className="card bg-amber-50 border-amber-200">
        <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-2">🏁 Długość toru</p>
        <div className="flex items-center gap-3">
          <input
            type="number"
            min={TRACK_DISTANCE_MIN_M}
            max={TRACK_DISTANCE_MAX_M}
            step={0.5}
            value={trackDistance}
            onChange={e => {
              if (!canEditDistance) return
              setTrackDistance(e.target.value)
              setDistanceSaved(false)
            }}
            disabled={!canEditDistance}
            placeholder="np. 35"
            className="form-input w-32 text-center font-mono disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed"
          />
          <span className="text-slate-600 font-medium">metrów</span>
          <button
            type="button"
            onClick={saveDistance}
            disabled={savingDistance || !trackDistance || !canEditDistance || !distanceValid}
            className="btn btn-primary btn-sm"
          >
            {savingDistance ? '...' : canEditDistance ? 'Zapisz' : '✅ Zapisano'}
          </button>
          {!distanceSaved && trackDistance && (
            <span className="text-xs text-amber-600">⚠️ Nie zapisano – prędkości nie będą obliczone</span>
          )}
        </div>
      </div>

      {/* ── Per-class groups ── */}
      {SIZE_CLASSES.map(cls => {
        const classRows = rows
          .map((r, idx) => ({ r, idx }))
          .filter(({ r }) => r.sizeClass === cls)

        if (classRows.length === 0) return null

        return (
          <section key={cls}>
            <h2 className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">
              <span className="h-px flex-1 bg-slate-200" />
              {SIZE_CLASS_LABELS[cls]}
              <span className="badge badge-yellow">{classRows.length} psów</span>
              <span className="h-px flex-1 bg-slate-200" />
            </h2>

            <div className="space-y-3">
              {classRows.map(({ r, idx }) => {
                const best = rowBestMs(r)
                const speed = best !== null && distanceM !== null
                  ? computeStoredSpeedKmh(best, distanceM)
                  : null

                return (
                  <div key={r.participantId} className="card">
                    {/* Header */}
                    <div className="flex items-start justify-between mb-3 gap-2 flex-wrap">
                      <div>
                        <div className="flex items-center gap-2">
                          {r.classRank !== null && (
                            <span className="text-xl font-bold">{medalEmoji(r.classRank)}</span>
                          )}
                          <p className="font-semibold text-slate-800">🐕 {r.dogName || '—'}</p>
                        </div>
                        <p className="text-sm text-slate-500">
                          👤 {r.ownerName || '—'}
                          {r.breed && ` · ${r.breed}`}
                          {r.heightCm !== null && (
                            <span className="ml-2 text-xs text-slate-400">📏 {r.heightCm} cm</span>
                          )}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        {/* Class override if height unknown */}
                        {r.heightCm === null && (
                          <select
                            value={r.sizeClass}
                            onChange={e => updateRow(idx, { sizeClass: e.target.value as SizeClass })}
                            className="form-input py-1 text-sm w-auto"
                            title="Klasa startowa (brak wzrostu – wybierz ręcznie)"
                          >
                            {SIZE_CLASSES.map(c => (
                              <option key={c} value={c}>{c}</option>
                            ))}
                          </select>
                        )}
                        {r.saved && !r.saving && (
                          <span className="badge badge-green text-xs">✓ Zapisano</span>
                        )}
                      </div>
                    </div>

                    {/* Run inputs */}
                    <div className="grid grid-cols-2 gap-3 mb-3">
                      <label className="block">
                        <span className="form-label text-xs">Przebieg 1 (s)</span>
                        <input
                          type="number"
                          min={0}
                          step={0.01}
                          value={r.run1}
                          onChange={e => updateRow(idx, { run1: e.target.value })}
                          placeholder="np. 4.57"
                          className="form-input font-mono"
                        />
                      </label>
                      <label className="block">
                        <span className="form-label text-xs">Przebieg 2 (s)</span>
                        <input
                          type="number"
                          min={0}
                          step={0.01}
                          value={r.run2}
                          onChange={e => updateRow(idx, { run2: e.target.value })}
                          placeholder="np. 4.43"
                          className="form-input font-mono"
                        />
                      </label>
                    </div>

                    {/* Computed stats */}
                    {best !== null && (
                      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 mb-3 text-sm">
                        <span className="text-slate-700">
                          ⏱️ Najlepszy: <strong className="font-mono">{formatRunTime(best)}</strong>
                        </span>
                        {speed !== null && (
                          <span className="text-slate-700">
                            🚀 Prędkość: <strong className="font-mono">{speed.toFixed(2)} km/h</strong>
                          </span>
                        )}
                        {!distanceM && (
                          <span className="text-xs text-amber-500">Ustaw długość toru aby obliczyć prędkość</span>
                        )}
                      </div>
                    )}

                    {/* Error */}
                    {r.error && <p className="text-red-600 text-xs mb-2">⚠️ {r.error}</p>}

                    {/* Save button */}
                    <button
                      type="button"
                      onClick={() => saveRow(idx)}
                      disabled={r.saving}
                      className="btn btn-primary btn-sm"
                    >
                      {r.saving ? 'Zapisywanie...' : '💾 Zapisz'}
                    </button>
                  </div>
                )
              })}
            </div>
          </section>
        )
      })}

      {/* ── Recalculate ranks ── */}
      <div className="card bg-sky-50 border-sky-200">
        <p className="text-sm font-semibold text-sky-800 mb-1">🏆 Oblicz miejsca w klasach</p>
        <p className="text-xs text-sky-600 mb-3">
          Przypisze miejsca (1, 2, 3...) w każdej klasie na podstawie najlepszego czasu. Wywołaj po zapisaniu wszystkich wyników.
        </p>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={recalculateRanks}
            disabled={recalculating}
            className="btn btn-primary"
          >
            {recalculating ? 'Przeliczanie...' : '🏆 Przelicz rankingi klas'}
          </button>
          {recalcMsg && <span className="text-sm text-slate-700">{recalcMsg}</span>}
        </div>
      </div>

      {/* ── Overall stats ── */}
      {withBest.length > 0 && (
        <div className="card">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">🌍 Statystyki całych zawodów</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {fastest && (
              <div className="rounded-xl bg-green-50 border border-green-200 p-3">
                <p className="text-xs text-green-600 font-semibold mb-1">⚡ Najszybszy pies</p>
                <p className="font-bold text-green-800">{fastest.row.dogName}</p>
                <p className="text-sm text-green-600">{fastest.row.ownerName} · {fastest.row.sizeClass}</p>
                <p className="font-mono text-green-700 mt-1">
                  {formatRunTime(fastest.best as number)}
                  {distanceM && (() => {
                    const speed = computeStoredSpeedKmh(fastest.best as number, distanceM)
                    return speed !== null ? ` · ${speed.toFixed(2)} km/h` : ''
                  })()}
                </p>
              </div>
            )}
            {slowest && slowest.row.participantId !== fastest?.row.participantId && (
              <div className="rounded-xl bg-orange-50 border border-orange-200 p-3">
                <p className="text-xs text-orange-600 font-semibold mb-1">🐢 Najwolniejszy pies</p>
                <p className="font-bold text-orange-800">{slowest.row.dogName}</p>
                <p className="text-sm text-orange-600">{slowest.row.ownerName} · {slowest.row.sizeClass}</p>
                <p className="font-mono text-orange-700 mt-1">
                  {formatRunTime(slowest.best as number)}
                  {distanceM && (() => {
                    const speed = computeStoredSpeedKmh(slowest.best as number, distanceM)
                    return speed !== null ? ` · ${speed.toFixed(2)} km/h` : ''
                  })()}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
