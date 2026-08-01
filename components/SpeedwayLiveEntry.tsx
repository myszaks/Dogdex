'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  SIZE_CLASSES,
  SIZE_CLASS_LABELS,
  getSizeClass,
  formatRunTime,
  isValidTrackDistanceM,
  parseRunMs,
  TRACK_DISTANCE_MAX_M,
  TRACK_DISTANCE_MIN_M,
} from '@/lib/speedway'
import type { SizeClass } from '@/lib/speedway'
import { formatPolishCount, POLISH_FORMS } from '@/lib/polish'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SpeedwayLiveParticipant {
  participantId: string
  dogName: string
  ownerName: string
  breed: string
  heightCm: number | null
  formSizeClass: string | null
  checkedIn: boolean
  result: {
    id: string
    run1_ms: number | null
    run2_ms: number | null
    run1_status: 'DNS' | 'DNF' | null
    run2_status: 'DNS' | 'DNF' | null
    best_ms: number | null
    speed_kmh: number | null
    size_class: string | null
    class_rank: number | null
  } | null
}

interface Props {
  eventId: string
  eventSlug: string
  initialEventStatus: string
  initialLivePhase: string | null
  initialTrackDistanceM: number | null
  participants: SpeedwayLiveParticipant[]
}

// ─── Local types ──────────────────────────────────────────────────────────────
type RunStatus = 'DNS' | 'DNF' | null

interface RowResult {
  resultId: string | null
  run1_ms: number | null
  run2_ms: number | null
  run1_status: RunStatus
  run2_status: RunStatus
  saving: boolean
  error: string | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function defaultClass(p: SpeedwayLiveParticipant): SizeClass {
  if (p.heightCm !== null) {
    const n = typeof p.heightCm === 'number' ? p.heightCm : parseFloat(p.heightCm as unknown as string)
    if (!isNaN(n)) return getSizeClass(n)
  }
  if (p.formSizeClass && SIZE_CLASSES.includes(p.formSizeClass as SizeClass)) {
    return p.formSizeClass as SizeClass
  }
  if (p.result?.size_class && SIZE_CLASSES.includes(p.result.size_class as SizeClass)) {
    return p.result.size_class as SizeClass
  }
  return 'M'
}

function runLabel(run: 1 | 2): string {
  return run === 1 ? 'Runda 1' : 'Runda 2'
}

function timeDisplay(ms: number | null, status: RunStatus): string {
  if (status === 'DNS') return 'DNS'
  if (status === 'DNF') return 'DNF'
  if (ms !== null) return formatRunTime(ms)
  return '—'
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function SpeedwayLiveEntry({
  eventId,
  eventSlug,
  initialEventStatus,
  initialLivePhase,
  initialTrackDistanceM,
  participants,
}: Props) {
  const router = useRouter()
  const [eventClosed, setEventClosed] = useState(
    initialEventStatus === 'finished' || initialEventStatus === 'cancelled'
  )

  // ── Track distance ────────────────────────────────────────────────────────
  const [trackDistance, setTrackDistance] = useState(
    initialTrackDistanceM !== null ? String(initialTrackDistanceM) : ''
  )
  const [distanceSaved, setDistanceSaved] = useState(initialTrackDistanceM !== null)
  const [savingDistance, setSavingDistance] = useState(false)
  const [distanceError, setDistanceError] = useState<string | null>(null)
  const distanceM = parseFloat(trackDistance) || null
  const distanceValid = isValidTrackDistanceM(trackDistance)
  const canEditDistance = !eventClosed && (!distanceSaved || !distanceValid)
  const canEnterResults = !eventClosed && distanceSaved && distanceM !== null && distanceValid
  const distanceRangeLabel = `${TRACK_DISTANCE_MIN_M}-${TRACK_DISTANCE_MAX_M} m`

  // ── Per-participant result state ──────────────────────────────────────────
  const [rows, setRows] = useState<Record<string, RowResult>>(() => {
    const map: Record<string, RowResult> = {}
    for (const p of participants) {
      map[p.participantId] = {
        resultId: p.result?.id ?? null,
        run1_ms: p.result?.run1_ms ?? null,
        run2_ms: p.result?.run2_ms ?? null,
        run1_status: (p.result?.run1_status as RunStatus) ?? null,
        run2_status: (p.result?.run2_status as RunStatus) ?? null,
        saving: false,
        error: null,
      }
    }
    return map
  })

  // ── Navigation state ──────────────────────────────────────────────────────
  const checkedInParticipants = participants.filter(p => p.checkedIn)
  const activeSizeClasses = SIZE_CLASSES.filter(cls =>
    checkedInParticipants.some(p => defaultClass(p) === cls)
  )

  const [classIdx, setClassIdx] = useState(0)
  const [currentRun, setCurrentRun] = useState<1 | 2>(1)
  const [dogIdx, setDogIdx] = useState(0)

  // ── List view toggle ──────────────────────────────────────────────────────
  const [listView, setListView] = useState(false)

  // ── Rank recalc ───────────────────────────────────────────────────────────
  const [recalculating, setRecalculating] = useState(false)
  const [recalcMsg, setRecalcMsg] = useState<string | null>(null)

  // ── Class results intermediate screen ────────────────────────────────────
  const [classResultsView, setClassResultsView] = useState<SizeClass | null>(null)

  // ── Input state ───────────────────────────────────────────────────────────
  const inputRef = useRef<HTMLInputElement>(null)
  const [inputVal, setInputVal] = useState('')

  const currentClass = activeSizeClasses[classIdx] ?? null
  const classParticipants = currentClass
    ? checkedInParticipants.filter(p => defaultClass(p) === currentClass)
    : []
  const currentParticipant = classParticipants[dogIdx] ?? null
  const isLastDogInClass = dogIdx === classParticipants.length - 1
  const isLastRun = currentRun === 2
  const isLastClass = classIdx === activeSizeClasses.length - 1

  // Sync input field when navigating to a different dog/run
  useEffect(() => {
    if (!currentParticipant) return
    const row = rows[currentParticipant.participantId]
    const ms = currentRun === 1 ? row?.run1_ms : row?.run2_ms
    const status = currentRun === 1 ? row?.run1_status : row?.run2_status
    if (status) {
      setInputVal('')
    } else {
      setInputVal(ms !== null && ms !== undefined ? (ms / 1000).toFixed(2) : '')
    }
    setTimeout(() => inputRef.current?.focus(), 80)
  }, [classIdx, currentRun, dogIdx, currentParticipant?.participantId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Save helper ───────────────────────────────────────────────────────────
  async function saveCurrentDog(opts: {
    run1_ms?: number | null
    run2_ms?: number | null
    run1_status?: RunStatus
    run2_status?: RunStatus
  }): Promise<boolean> {
    if (!currentParticipant) return false
    const pid = currentParticipant.participantId
    const row = rows[pid]

    if (eventClosed) {
      setRows(prev => ({
        ...prev,
        [pid]: {
          ...prev[pid],
          saving: false,
          error: 'Zawody są zakończone. Edycja wyników jest zablokowana.',
        },
      }))
      return false
    }

    if (!canEnterResults) {
      setRows(prev => ({
        ...prev,
        [pid]: {
          ...prev[pid],
          saving: false,
          error: 'Najpierw wpisz i zapisz długość toru',
        },
      }))
      return false
    }

    // Compute merged values upfront — used in payload AND to update local state on success.
    // Using json.field ?? prev is WRONG when clearing to null, because null ?? x returns x.
    const merged_r1 = opts.run1_ms !== undefined ? opts.run1_ms : row?.run1_ms ?? null
    const merged_r2 = opts.run2_ms !== undefined ? opts.run2_ms : row?.run2_ms ?? null
    const merged_s1 = opts.run1_status !== undefined ? opts.run1_status : row?.run1_status ?? null
    const merged_s2 = opts.run2_status !== undefined ? opts.run2_status : row?.run2_status ?? null

    const payload = {
      eventId,
      participantId: pid,
      resultId: row?.resultId ?? undefined,
      run1_ms: merged_r1,
      run2_ms: merged_r2,
      run1_status: merged_s1,
      run2_status: merged_s2,
      size_class: currentClass,
      track_distance_m: distanceM,
    }

    setRows(prev => ({ ...prev, [pid]: { ...prev[pid], saving: true, error: null } }))
    try {
      const res = await fetch('/api/results', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Błąd serwera')
      setRows(prev => ({
        ...prev,
        [pid]: {
          ...prev[pid],
          saving: false,
          resultId: json.id ?? prev[pid].resultId,
          run1_ms: merged_r1,
          run2_ms: merged_r2,
          run1_status: merged_s1,
          run2_status: merged_s2,
        },
      }))
      recalculateRanks({ silent: true }).catch(() => {})
      return true
    } catch (err) {
      setRows(prev => ({
        ...prev,
        [pid]: { ...prev[pid], saving: false, error: err instanceof Error ? err.message : 'Błąd' },
      }))
      return false
    }
  }

  // ── Navigation ────────────────────────────────────────────────────────────
  function advance() {
    if (dogIdx < classParticipants.length - 1) {
      setDogIdx(d => d + 1)
    } else if (currentRun === 1) {
      setCurrentRun(2)
      setDogIdx(0)
    } else {
      // Finished round 2 → show class results (auto-recalculate for live page)
      setClassResultsView(currentClass)
      recalculateRanks().catch(() => {})
    }
  }

  function proceedAfterClassResults() {
    setClassResultsView(null)
    if (classIdx < activeSizeClasses.length - 1) {
      setClassIdx(c => c + 1)
      setCurrentRun(1)
      setDogIdx(0)
    } else {
      setDogIdx(classParticipants.length) // trigger trulyDone
    }
  }

  function goBack() {
    if (dogIdx > 0) {
      setDogIdx(d => d - 1)
    } else if (currentRun === 2) {
      setCurrentRun(1)
      setDogIdx(classParticipants.length - 1)
    } else if (classIdx > 0) {
      const prevClassParts = checkedInParticipants.filter(
        p => defaultClass(p) === activeSizeClasses[classIdx - 1]
      )
      setClassIdx(c => c - 1)
      setCurrentRun(2)
      setDogIdx(prevClassParts.length - 1)
    }
  }


  // ── DNS / DNF (save immediately + advance) ──────────────────────────────
  function handleStatus(status: 'DNS' | 'DNF') {
    if (!currentParticipant || eventClosed) return
    setInputVal('')
    const update = currentRun === 1
      ? { run1_ms: null as number | null, run1_status: status as RunStatus }
      : { run2_ms: null as number | null, run2_status: status as RunStatus }
    saveCurrentDog(update).then(saved => { if (saved) advance() })
  }

  // ── handleAdvance: save current input (if changed) then advance ─────────────────
  async function handleAdvance() {
    if (!currentParticipant) { advance(); return }
    if (eventClosed) return
    if (!canEnterResults) {
      const pid = currentParticipant.participantId
      setRows(prev => ({
        ...prev,
        [pid]: {
          ...prev[pid],
          saving: false,
          error: 'Najpierw wpisz i zapisz długość toru',
        },
      }))
      return
    }

    const row = rows[currentParticipant.participantId]
    const ms = parseRunMs(inputVal)
    const prevMs = currentRun === 1 ? row?.run1_ms : row?.run2_ms

    // Only save if value actually changed
    if (ms !== null && ms !== prevMs) {
      const update = currentRun === 1
        ? { run1_ms: ms, run1_status: null as RunStatus }
        : { run2_ms: ms, run2_status: null as RunStatus }
      const saved = await saveCurrentDog(update)
      if (!saved) return
    }
    advance()
  }

  // ── Sync current_start_index for live page ───────────────────────────────
  function computeGlobalIndex(cIdx: number, run: 1 | 2, dIdx: number): number {
    let idx = 0
    for (let i = 0; i < cIdx; i++) {
      const n = checkedInParticipants.filter(p => defaultClass(p) === activeSizeClasses[i]).length
      idx += 2 * n
    }
    if (activeSizeClasses[cIdx]) {
      const n = checkedInParticipants.filter(p => defaultClass(p) === activeSizeClasses[cIdx]).length
      idx += run === 1 ? dIdx : n + dIdx
    }
    return idx
  }

  useEffect(() => {
    if (eventClosed) return
    const completedAll =
      activeSizeClasses.length > 0 &&
      classIdx === activeSizeClasses.length - 1 &&
      currentRun === 2 &&
      dogIdx >= classParticipants.length

    if (classResultsView !== null || (!currentParticipant && !completedAll)) return
    const globalIdx = computeGlobalIndex(classIdx, currentRun, dogIdx)
    fetch(`/api/events/${eventId}/start-index`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'set', value: globalIdx }),
    }).catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classIdx, currentRun, dogIdx, classResultsView])

  // ── Track distance save ───────────────────────────────────────────────────
  async function saveDistance() {
    if (!canEditDistance) return
    const val = parseFloat(trackDistance)
    if (!isValidTrackDistanceM(val)) {
      setDistanceSaved(false)
      setDistanceError(`Długość toru musi być w zakresie ${distanceRangeLabel}.`)
      return
    }
    setSavingDistance(true)
    setDistanceError(null)
    try {
      const res = await fetch(`/api/events/${eventId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ track_distance_m: val }),
      })
      if (!res.ok) throw new Error('Nie udało się zapisać długości toru.')
      setTrackDistance(String(val))
      setDistanceSaved(true)
      router.refresh()
    } catch {
      setDistanceSaved(false)
      setDistanceError('Nie udało się zapisać długości toru.')
    } finally {
      setSavingDistance(false)
    }
  }

  // ── Recalculate ranks ─────────────────────────────────────────────────────
  async function recalculateRanks(opts: { silent?: boolean } = {}) {
    if (eventClosed) return
    if (!opts.silent) {
      setRecalculating(true)
      setRecalcMsg(null)
    }
    try {
      const res = await fetch(`/api/events/${eventId}/recalculate-ranks`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Błąd')
      if (!opts.silent) setRecalcMsg(`✅ Przeliczono miejsca (${json.updated} wyników)`)
    } catch (err) {
      if (!opts.silent) setRecalcMsg(`❌ ${err instanceof Error ? err.message : 'Błąd'}`)
    } finally {
      if (!opts.silent) setRecalculating(false)
    }
  }

  // ── Podium announce ───────────────────────────────────────────────────────
  const [podiumAnnounced, setPodiumAnnounced] = useState(initialLivePhase === 'podium')
  const [podiumSaving, setPodiumSaving] = useState(false)
  const [finishConfirm, setFinishConfirm] = useState(false)
  const [finishSaving, setFinishSaving] = useState(false)
  const [finishError, setFinishError] = useState<string | null>(null)

  async function announcePodium() {
    setPodiumSaving(true)
    try {
      await recalculateRanks({ silent: true })
      await fetch(`/api/events/${eventId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ live_phase: 'podium' }),
      })
      setPodiumAnnounced(true)
    } finally {
      setPodiumSaving(false)
    }
  }

  async function finishEvent() {
    if (!finishConfirm) {
      setFinishConfirm(true)
      setTimeout(() => setFinishConfirm(false), 4000)
      return
    }

    setFinishSaving(true)
    setFinishError(null)
    try {
      await recalculateRanks({ silent: true })
      const res = await fetch(`/api/events/${eventId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'finished', live_phase: 'podium' }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.error ?? 'Nie udało się zakończyć zawodów.')
      }
      setEventClosed(true)
      setPodiumAnnounced(true)
      setFinishConfirm(false)
      router.refresh()
    } catch (err) {
      setFinishError(err instanceof Error ? err.message : 'Nie udało się zakończyć zawodów.')
    } finally {
      setFinishSaving(false)
    }
  }

  // ── Derived ───────────────────────────────────────────────────────────────
  const trulyDone = activeSizeClasses.length > 0 && !currentParticipant && classResultsView === null
  const currentRow = currentParticipant ? rows[currentParticipant.participantId] : null
  const currentStatus = currentRow
    ? (currentRun === 1 ? currentRow.run1_status : currentRow.run2_status)
    : null

  const doneInThisRound = classParticipants.filter(p => {
    const r = rows[p.participantId]
    if (!r) return false
    const ms = currentRun === 1 ? r.run1_ms : r.run2_ms
    const st = currentRun === 1 ? r.run1_status : r.run2_status
    return ms !== null || st !== null
  }).length
  const progressPct = classParticipants.length > 0
    ? Math.round((doneInThisRound / classParticipants.length) * 100)
    : 0

  const nextDogs = classParticipants.slice(dogIdx + 1, dogIdx + 3)
  // When at the last dog in round 1, hint about round 2
  const nextRound2Dogs =
    currentRun === 1 && isLastDogInClass ? classParticipants.slice(0, 2) : []

  // Locally computed ranking for the class results screen
  const classResultRanked = classResultsView
    ? checkedInParticipants
        .filter(p => defaultClass(p) === classResultsView)
        .map(p => {
          const r = rows[p.participantId]
          const r1 = r?.run1_ms ?? null
          const r2 = r?.run2_ms ?? null
          const best = r1 !== null && r2 !== null ? Math.min(r1, r2) : r1 ?? r2
          return { p, r, best }
        })
        .sort((a, b) => {
          if (a.best === null && b.best === null) return 0
          if (a.best === null) return 1
          if (b.best === null) return -1
          return a.best - b.best
        })
    : []

  // ── Edge case: no participants ────────────────────────────────────────────
  if (participants.length === 0) {
    return (
      <div className="card text-center py-12 text-slate-500">
        <p className="text-3xl mb-3">👥</p>
        <p>Brak potwierdzonych uczestników</p>
      </div>
    )
  }

  if (checkedInParticipants.length === 0) {
    return (
      <div className="card text-center py-12 text-slate-500">
        <p className="text-3xl mb-3">🐾</p>
        <p className="font-semibold text-slate-700">Brak psów po odprawie</p>
        <p className="text-sm mt-1">
          Przejdź do{' '}
          <a href={`/organizer/events/${eventSlug}/checkin`} className="text-sky-600 underline">
            Odprawa
          </a>
          , aby zatwierdzić uczestników.
        </p>
      </div>
    )
  }

  // ── LIST VIEW ─────────────────────────────────────────────────────────────
  if (listView) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-slate-800">Lista wyników</h2>
          <button onClick={() => setListView(false)} className="btn btn-secondary btn-sm">
            ◀ Powrót
          </button>
        </div>

        {/* Track distance */}
        <div className="card bg-amber-50 border-amber-200 flex items-center gap-3 flex-wrap">
          <span className="text-sm font-medium text-amber-700">🏁 Długość toru:</span>
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
              setDistanceError(null)
            }}
            disabled={!canEditDistance}
            className="form-input w-24 text-center font-mono py-1 disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed" />
          <span className="text-sm text-slate-600">m</span>
          {canEditDistance ? (
            <button onClick={saveDistance} disabled={savingDistance || !trackDistance || !distanceValid}
              className="btn btn-primary btn-sm">
              {savingDistance ? '...' : 'Zapisz'}
            </button>
          ) : distanceSaved ? (
            <span className="text-xs text-green-700">✓ zapisano i zablokowano</span>
          ) : null}
          {!canEnterResults && (
            <span className="text-xs text-amber-700">
              {eventClosed
                ? 'Zawody zakończone. Edycja wyników jest zablokowana.'
                : !distanceValid && trackDistance
                  ? `Popraw długość toru (${distanceRangeLabel}).`
                  : 'Zapisz długość toru, aby odblokować wpisywanie wyników.'}
            </span>
          )}
          {distanceError && <span className="text-xs text-red-600">{distanceError}</span>}
        </div>

        {activeSizeClasses.map(cls => {
          const cps = checkedInParticipants.filter(p => defaultClass(p) === cls)
          return (
            <section key={cls}>
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
                {SIZE_CLASS_LABELS[cls]}
              </h3>
              <div className="card p-0 overflow-hidden">
                {/* Header row */}
                <div className="grid grid-cols-[1fr_auto_auto] items-center px-4 py-2 bg-slate-50 border-b border-slate-100">
                  <span className="text-xs font-semibold text-slate-500">Pies / właściciel</span>
                  <span className="text-xs font-semibold text-slate-500 text-right w-20">R1</span>
                  <span className="text-xs font-semibold text-slate-500 text-right w-20">R2</span>
                </div>
                <div className="divide-y divide-slate-100">
                  {cps.map((p, i) => {
                    const r = rows[p.participantId]
                    const idx = activeSizeClasses.indexOf(cls)
                    // Navigate to first unfilled run, otherwise run 1
                    const goRun: 1 | 2 =
                      r?.run1_ms === null && r?.run1_status === null ? 1 : 2
                    return (
                      <button
                        key={p.participantId}
                        onClick={() => {
                          if (eventClosed) return
                          setClassIdx(idx)
                          setCurrentRun(goRun)
                          setDogIdx(i)
                          setListView(false)
                        }}
                        disabled={eventClosed}
                        className="w-full grid grid-cols-[1fr_auto_auto] items-center px-4 py-3 text-left hover:bg-slate-50 transition-colors disabled:cursor-default disabled:hover:bg-white"
                      >
                        <div className="min-w-0 pr-2">
                          <p className="font-medium text-slate-800 text-sm truncate">{p.dogName || '—'}</p>
                          <p className="text-xs text-slate-400 truncate">{p.ownerName || '—'}</p>
                        </div>
                        <span className={`text-sm font-mono text-right w-20 shrink-0 ${
                          r?.run1_status === 'DNS' || r?.run1_status === 'DNF'
                            ? 'text-orange-500 font-semibold'
                            : r?.run1_ms !== null
                              ? 'text-green-600 font-semibold'
                              : 'text-slate-300'
                        }`}>
                          {timeDisplay(r?.run1_ms ?? null, r?.run1_status ?? null)}
                        </span>
                        <span className={`text-sm font-mono text-right w-20 shrink-0 ${
                          r?.run2_status === 'DNS' || r?.run2_status === 'DNF'
                            ? 'text-orange-500 font-semibold'
                            : r?.run2_ms !== null
                              ? 'text-green-600 font-semibold'
                              : 'text-slate-300'
                        }`}>
                          {timeDisplay(r?.run2_ms ?? null, r?.run2_status ?? null)}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            </section>
          )
        })}

        {eventClosed && (
          <div className="card bg-slate-50 border-slate-200 text-sm text-slate-600">
            Zawody są zakończone. Lista jest tylko do podglądu.
          </div>
        )}
      </div>
    )
  }

  // ── SINGLE DOG VIEW ───────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-4">

      {/* Top bar: class tabs + list toggle */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          {activeSizeClasses.map((cls, i) => (
            <span key={cls} className={`text-xs font-bold px-2 py-0.5 rounded-full ${
              i < classIdx
                ? 'bg-green-100 text-green-700'
                : i === classIdx
                  ? 'bg-sky-100 text-sky-700 ring-1 ring-sky-400'
                  : 'bg-slate-100 text-slate-400'
            }`}>
              {cls}{i < classIdx ? ' ✓' : i === classIdx ? ` R${currentRun}` : ''}
            </span>
          ))}
        </div>
        <button onClick={() => setListView(true)} className="btn btn-secondary btn-sm shrink-0">
          ≡ Lista
        </button>
      </div>

      {/* Progress bar */}
      {currentClass && (
        <div>
          <div className="flex justify-between text-xs text-slate-400 mb-1">
            <span>{SIZE_CLASS_LABELS[currentClass]} · {runLabel(currentRun)}</span>
            <span>
              {formatPolishCount(doneInThisRound, POLISH_FORMS.dog)}
              {' / '}
              {formatPolishCount(classParticipants.length, POLISH_FORMS.dog)}
            </span>
          </div>
          <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-sky-500 rounded-full transition-all duration-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      )}

      {/* Track distance (compact) */}
      <div className="flex items-center gap-2 flex-wrap text-sm">
        <span className="text-slate-500">🏁 Tor:</span>
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
            setDistanceError(null)
          }}
          disabled={!canEditDistance}
          className="form-input w-20 text-center font-mono py-1 text-sm disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed"
        />
        <span className="text-slate-400">m</span>
        {canEditDistance && trackDistance && (
          <button onClick={saveDistance} disabled={savingDistance || !distanceValid} className="btn btn-primary btn-sm">
            {savingDistance ? '...' : 'Zapisz'}
          </button>
        )}
        {distanceSaved && !canEditDistance && <span className="text-green-600 text-xs">✓ zapisano i zablokowano</span>}
        {!canEnterResults && (
          <span className="text-amber-600 text-xs">
            {eventClosed
              ? 'Edycja wyników jest zablokowana'
              : !distanceValid && trackDistance
                ? `Popraw długość toru (${distanceRangeLabel})`
                : 'Zapisz tor, aby wpisywać wyniki'}
          </span>
        )}
        {distanceError && <span className="text-red-600 text-xs">{distanceError}</span>}
      </div>

      {eventClosed && (
        <div className="card text-center py-10 bg-slate-50 border-slate-200">
          <p className="text-4xl mb-3">🏁</p>
          <p className="font-bold text-slate-800 text-lg">Zawody zakończone</p>
          <p className="text-sm text-slate-500 mt-1">
            Edycja wyników i przesuwanie kolejki startowej są zablokowane.
          </p>
          <div className="flex flex-col items-center gap-3 mt-4">
            <button onClick={() => setListView(true)} className="btn btn-secondary">
              ≡ Lista wyników
            </button>
            <a href={`/live/${eventSlug}`} className="btn btn-primary">
              🏆 Podium na żywo
            </a>
          </div>
        </div>
      )}

      {/* Class finished — intermediate results screen */}
      {!eventClosed && classResultsView ? (
        <div className="space-y-4">
          <div className="card bg-green-50 border-green-300">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="font-bold text-green-800 text-lg">✅ Klasa {classResultsView} — wyniki</h3>
                <p className="text-sm text-green-600">Oba przebiegi ukończone</p>
              </div>
              {recalculating && <span className="text-xs text-slate-400 shrink-0">Przeliczam ranking...</span>}
            </div>
            {recalcMsg && <p className="text-xs text-green-700 mt-2">{recalcMsg}</p>}
          </div>

          <div className="card p-0 overflow-hidden">
            <div className="grid grid-cols-[auto_1fr_auto_auto_auto] items-center px-4 py-2 bg-slate-50 border-b border-slate-100">
              <span className="text-xs font-semibold text-slate-400 w-7">#</span>
              <span className="text-xs font-semibold text-slate-400 pl-1">Pies</span>
              <span className="text-xs font-semibold text-slate-400 text-right w-14">R1</span>
              <span className="text-xs font-semibold text-slate-400 text-right w-14">R2</span>
              <span className="text-xs font-semibold text-slate-400 text-right w-20">Najlepszy</span>
            </div>
            <div className="divide-y divide-slate-100">
              {classResultRanked.map(({ p, r, best }, i) => (
                <div
                  key={p.participantId}
                  className={`grid grid-cols-[auto_1fr_auto_auto_auto] items-center px-4 py-3 ${
                    i === 0 ? 'bg-yellow-50' : ''
                  }`}
                >
                  <span className="font-bold w-7 text-sm text-slate-500">
                    {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`}
                  </span>
                  <div className="pl-1 min-w-0">
                    <p className="font-medium text-slate-800 text-sm truncate">{p.dogName || '—'}</p>
                    <p className="text-xs text-slate-400 truncate">{p.ownerName || '—'}</p>
                  </div>
                  <span className="font-mono text-sm text-right w-14 shrink-0 text-slate-600">
                    {timeDisplay(r?.run1_ms ?? null, r?.run1_status ?? null)}
                  </span>
                  <span className="font-mono text-sm text-right w-14 shrink-0 text-slate-600">
                    {timeDisplay(r?.run2_ms ?? null, r?.run2_status ?? null)}
                  </span>
                  <span className={`font-mono font-semibold text-sm text-right w-20 shrink-0 ${
                    best !== null ? 'text-sky-600' : 'text-slate-300'
                  }`}>
                    {best !== null ? formatRunTime(best) : '—'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <button
            onClick={proceedAfterClassResults}
            className="btn btn-primary w-full py-4 text-base"
          >
            {isLastClass
              ? '🏁 Przejdź do podsumowania'
              : `Następna klasa: ${activeSizeClasses[classIdx + 1]} ▶`}
          </button>
          <button onClick={() => setListView(true)} className="btn btn-secondary w-full">
            ≡ Pełna lista
          </button>
        </div>

      ) : !eventClosed && trulyDone ? (
        <div className="card text-center py-10 bg-green-50 border-green-200">
          <p className="text-4xl mb-3">🏁</p>
          <p className="font-bold text-green-800 text-lg">Wszystkie klasy ukończone!</p>
          <div className="flex flex-col items-center gap-3 mt-4">
            <button onClick={() => setListView(true)} className="btn btn-secondary">
              ≡ Lista wyników
            </button>
            {podiumAnnounced ? (
              <p className="text-green-700 font-semibold text-sm">🏆 Podium ogłoszone na żywo!</p>
            ) : (
              <button
                onClick={announcePodium}
                disabled={podiumSaving}
                className="btn btn-primary py-3 px-6 text-base"
              >
                {podiumSaving ? '...' : '🏆 Ogłoś podium na żywo'}
              </button>
            )}
            <button
              onClick={finishEvent}
              disabled={finishSaving}
              className={`btn py-3 px-6 text-base ${
                finishConfirm
                  ? 'bg-green-700 text-white border-green-700 hover:bg-green-800'
                  : 'btn-secondary'
              }`}
            >
              {finishSaving
                ? 'Zamykanie...'
                : finishConfirm
                  ? 'Potwierdź zakończenie zawodów'
                  : 'Zakończ i zablokuj edycję'}
            </button>
            {finishError && <p className="text-red-600 text-xs">{finishError}</p>}
          </div>
        </div>
      ) : !eventClosed && currentParticipant ? (
        <>
          {/* Dog card */}
          <div className="card border-2 border-sky-300 bg-sky-50">
            {/* Dog info */}
            <div className="flex items-start justify-between gap-2 mb-4">
              <div>
                <p className="text-2xl font-bold text-slate-800 leading-tight">
                  🐕 {currentParticipant.dogName || '—'}
                </p>
                <p className="text-slate-500 mt-0.5">
                  {currentParticipant.ownerName || '—'}
                  {currentParticipant.breed ? ` · ${currentParticipant.breed}` : ''}
                  {currentParticipant.heightCm !== null ? ` · ${currentParticipant.heightCm} cm` : ''}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-3xl font-bold text-sky-600">{dogIdx + 1}</p>
                <p className="text-xs text-slate-400">/ {classParticipants.length}</p>
              </div>
            </div>

            {/* Time input */}
            <div className="mb-4">
              <label htmlFor="speedway-live-time" className="form-label text-sm">{runLabel(currentRun)} — czas (sekundy)</label>
              {currentStatus ? (
                <div className="flex items-center gap-3">
                  <span className="text-2xl font-bold text-orange-500">{currentStatus}</span>
                  <button
                    onClick={() => {
                      setInputVal('')
                      const update = currentRun === 1
                        ? { run1_ms: null as number | null, run1_status: null as RunStatus }
                        : { run2_ms: null as number | null, run2_status: null as RunStatus }
                      saveCurrentDog(update).then(() => {
                        setTimeout(() => inputRef.current?.focus(), 50)
                      })
                    }}
                    disabled={!canEnterResults}
                    className="btn btn-secondary btn-sm"
                  >
                    ✏️ Koryguj
                  </button>
                </div>
              ) : (
                <input
                  id="speedway-live-time"
                  ref={inputRef}
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step={0.01}
                  value={inputVal}
                  onChange={e => setInputVal(e.target.value)}
                  placeholder="np. 4.57"
                  disabled={!canEnterResults}
                  className="form-input font-mono text-2xl text-center w-full py-4 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
                />
              )}
            </div>

            {/* DNS / DNF buttons */}
            {!currentStatus && (
              <div className="grid grid-cols-2 gap-3 mb-2">
                <button
                  onClick={() => handleStatus('DNS')}
                  disabled={!canEnterResults}
                  className="btn btn-secondary py-4 text-orange-600 hover:bg-orange-50 hover:border-orange-300 font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  DNS
                  <span className="block text-xs font-normal text-slate-400">nie startował</span>
                </button>
                <button
                  onClick={() => handleStatus('DNF')}
                  disabled={!canEnterResults}
                  className="btn btn-secondary py-4 text-red-600 hover:bg-red-50 hover:border-red-300 font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  DNF
                  <span className="block text-xs font-normal text-slate-400">nie ukończył</span>
                </button>
              </div>
            )}

            {currentRow?.error && (
              <p className="text-xs text-red-500 mt-2">⚠️ {currentRow.error}</p>
            )}
            {currentRow?.saving && (
              <p className="text-xs text-slate-400 mt-2">Zapisywanie...</p>
            )}

            {/* Run 1 summary when entering Run 2 */}
            {currentRun === 2 && (
              <div className="mt-3 pt-3 border-t border-sky-200">
                <p className="text-xs text-slate-400">
                  Runda 1:{' '}
                  <span className="font-mono font-medium text-slate-600">
                    {timeDisplay(currentRow?.run1_ms ?? null, currentRow?.run1_status ?? null)}
                  </span>
                </p>
              </div>
            )}
          </div>

          {/* Navigation buttons */}
          <div className="flex items-center gap-3">
            <button
              onClick={goBack}
              disabled={classIdx === 0 && currentRun === 1 && dogIdx === 0}
              className="btn btn-secondary flex-1"
            >
              ◀ Poprzedni
            </button>
            <button
              onClick={handleAdvance}
              disabled={!canEnterResults}
              className="btn btn-primary flex-1"
            >
              {isLastDogInClass && currentRun === 1
                ? 'Runda 2 ▶'
                : isLastDogInClass && isLastRun
                  ? 'Zakończ klasę ▶'
                  : 'Następny ▶'}
            </button>
          </div>

          {/* Upcoming dogs */}
          {(nextDogs.length > 0 || nextRound2Dogs.length > 0) && (
            <div className="rounded-2xl bg-white px-3 py-3 shadow-sm">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-2">
                Przygotuj kolejne psy
              </p>
              <div className="space-y-2">
                {nextDogs.map((p, idx) => (
                  <div key={`${p.participantId}-${currentRun}-${idx}`} className="flex items-center gap-3 rounded-xl bg-slate-50 px-3 py-2">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-500">
                      {dogIdx + idx + 2}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-800">{p.dogName || '—'}</p>
                      <p className="truncate text-xs text-slate-400">{p.ownerName || '—'}</p>
                    </div>
                    <span className="shrink-0 rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-bold text-sky-700">
                      R{currentRun}
                    </span>
                  </div>
                ))}
                {nextRound2Dogs.map((p, idx) => (
                  <div key={`${p.participantId}-r2-${idx}`} className="flex items-center gap-3 rounded-xl bg-sky-50 px-3 py-2">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-xs font-bold text-sky-600 ring-1 ring-sky-200">
                      {idx + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-800">{p.dogName || '—'}</p>
                      <p className="truncate text-xs text-slate-400">{p.ownerName || '—'}</p>
                    </div>
                    <span className="shrink-0 rounded-full bg-sky-600 px-2 py-0.5 text-[11px] font-bold text-white">
                      R2
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      ) : null}
    </div>
  )
}
