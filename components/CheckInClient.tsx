'use client'
import { useCallback, useEffect, useState } from 'react'
import { formatPolishCount } from '@/lib/polish'
import QrCheckInScanner from '@/components/QrCheckInScanner'
import { BellRing, RefreshCw, ScanLine, Sparkles, WifiOff } from 'lucide-react'
import { parseCheckInCode } from '@/lib/eventDay'

interface CheckInParticipant {
  registrationId: string
  participantId: string
  dogName: string
  ownerName: string
  sizeClass: string
  checkedIn: boolean
  checkinToken: string
}

interface Props {
  initialParticipants: CheckInParticipant[]
  classOptions: Array<{ key: string; label: string }>
  eventClosed: boolean
  eventId: string
}

export default function CheckInClient({
  initialParticipants,
  classOptions,
  eventClosed,
  eventId,
}: Props) {
  const [participants, setParticipants] = useState(initialParticipants)
  const [loading, setLoading] = useState<Record<string, boolean>>({})
  const [manualCode, setManualCode] = useState('')
  const [queuedCount, setQueuedCount] = useState(0)
  const [message, setMessage] = useState<string | null>(null)
  const [toolLoading, setToolLoading] = useState<string | null>(null)

  const queueKey = `dogdex:event-day:${eventId}:queue`

  const readQueue = useCallback((): Array<{ token: string; checkedIn: boolean; clientMutationId: string; occurredAt: string; source: 'offline' }> => {
    try {
      const value = JSON.parse(localStorage.getItem(queueKey) ?? '[]')
      return Array.isArray(value) ? value : []
    } catch { return [] }
  }, [queueKey])

  const writeQueue = useCallback((items: ReturnType<typeof readQueue>) => {
    localStorage.setItem(queueKey, JSON.stringify(items))
    setQueuedCount(items.length)
  }, [queueKey])

  const flushQueue = useCallback(async () => {
    const items = readQueue()
    if (items.length === 0) return
    try {
      const response = await fetch(`/api/events/${eventId}/event-day`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'checkin_batch', items }),
      })
      if (!response.ok) return
      const data = await response.json()
      const failed = new Set((data.results ?? []).filter((result: { ok?: boolean }) => !result.ok).map((result: { token: string }) => result.token))
      writeQueue(items.filter(item => failed.has(item.token)))
      setMessage('Zsynchronizowano odprawy zapisane offline.')
    } catch { /* kolejna próba po odzyskaniu sieci */ }
  }, [eventId, readQueue, writeQueue])

  useEffect(() => {
    queueMicrotask(() => setQueuedCount(readQueue().length))
    window.addEventListener('online', flushQueue)
    queueMicrotask(() => void flushQueue())
    return () => window.removeEventListener('online', flushQueue)
  }, [flushQueue, readQueue])

  const checkedInCount = participants.filter(p => p.checkedIn).length

  const activeSizeClasses = [
    ...classOptions.filter(option => participants.some(p => p.sizeClass === option.key)),
    ...(
      participants.some(participant => participant.sizeClass === '__unassigned')
        ? [{ key: '__unassigned', label: 'Brak przypisanej klasy' }]
        : []
    ),
  ]

  const toggleCheckIn = useCallback(async (p: CheckInParticipant, source: 'manual' | 'qr' | 'bulk' = 'manual') => {
    if (eventClosed) return
    const newVal = !p.checkedIn
    setLoading(prev => ({ ...prev, [p.registrationId]: true }))
    try {
      const mutation = {
        token: p.checkinToken,
        checkedIn: newVal,
        clientMutationId: crypto.randomUUID(),
        occurredAt: new Date().toISOString(),
        source,
      }
      const res = await fetch(`/api/events/${eventId}/event-day`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'checkin_batch', items: [mutation] }),
      })
      if (!res.ok) {
        const json = await res.json()
        throw new Error(json.error ?? 'Błąd serwera')
      }
      const json = await res.json()
      if (!json.results?.[0]?.ok) throw new Error(json.results?.[0]?.error ?? 'Nie udało się odprawić uczestnika')
      setParticipants(prev =>
        prev.map(x => x.registrationId === p.registrationId ? { ...x, checkedIn: newVal } : x)
      )
      setMessage(newVal ? `Odprawiono: ${p.dogName}` : `Cofnięto odprawę: ${p.dogName}`)
    } catch (error) {
      if (!navigator.onLine || error instanceof TypeError) {
        const queued = readQueue()
        queued.push({ token: p.checkinToken, checkedIn: newVal, clientMutationId: crypto.randomUUID(), occurredAt: new Date().toISOString(), source: 'offline' })
        writeQueue(queued)
        setParticipants(prev => prev.map(x => x.registrationId === p.registrationId ? { ...x, checkedIn: newVal } : x))
        setMessage(`Zapisano offline: ${p.dogName}`)
      } else {
        setMessage(error instanceof Error ? error.message : 'Błąd serwera')
      }
    } finally {
      setLoading(prev => ({ ...prev, [p.registrationId]: false }))
    }
  }, [eventClosed, eventId, readQueue, writeQueue])

  async function checkInAll() {
    if (eventClosed) return
    const notIn = participants.filter(p => !p.checkedIn)
    for (const p of notIn) await toggleCheckIn(p, 'bulk')
  }

  const handleScannedCode = useCallback((raw: string) => {
    const token = parseCheckInCode(raw)
    const participant = participants.find(item => item.checkinToken.toLowerCase() === token.toLowerCase())
    if (!participant) {
      setMessage('Ten kod nie należy do potwierdzonego uczestnika tego wydarzenia.')
      return
    }
    if (participant.checkedIn) {
      setMessage(`${participant.dogName} jest już odprawiony.`)
      return
    }
    void toggleCheckIn(participant, 'qr')
    setManualCode('')
  }, [participants, toggleCheckIn])

  async function runTool(action: 'optimize_queue' | 'notify_next') {
    setToolLoading(action)
    setMessage(null)
    try {
      const response = await fetch(`/api/events/${eventId}/event-day`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, count: 3 }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? 'Nie udało się wykonać operacji')
      setMessage(action === 'optimize_queue'
        ? 'Kolejka została uporządkowana: odprawieni uczestnicy są pierwsi.'
        : `Wysłano ${data.sent} z ${data.targeted} powiadomień.`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Nie udało się wykonać operacji')
    } finally { setToolLoading(null) }
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="card space-y-4 border-primary/20 bg-primary/5">
          <div className="flex items-center gap-2"><ScanLine className="h-5 w-5 text-primary" /><h3 className="font-heading font-semibold">Skaner odprawy QR</h3></div>
          <QrCheckInScanner onCode={handleScannedCode} />
          <div className="flex gap-2">
            <input className="form-input" value={manualCode} onChange={event => setManualCode(event.target.value)} placeholder="Wklej kod odprawy" />
            <button type="button" className="btn btn-primary btn-sm" onClick={() => handleScannedCode(manualCode)} disabled={!manualCode.trim()}>Sprawdź</button>
          </div>
          {queuedCount > 0 && <p className="flex items-center gap-2 text-xs font-semibold text-amber-700"><WifiOff className="h-4 w-4" />{queuedCount} operacji czeka na synchronizację <button type="button" onClick={() => void flushQueue()} className="underline">Spróbuj teraz</button></p>}
        </div>
        <div className="card space-y-3">
          <h3 className="font-heading font-semibold">Narzędzia kolejki</h3>
          <button type="button" className="btn btn-secondary w-full" onClick={() => runTool('optimize_queue')} disabled={eventClosed || toolLoading !== null}><Sparkles className="h-4 w-4" /> Uporządkuj kolejkę</button>
          <button type="button" className="btn btn-secondary w-full" onClick={() => runTool('notify_next')} disabled={eventClosed || toolLoading !== null}><BellRing className="h-4 w-4" /> Powiadom 3 kolejne osoby</button>
          {toolLoading && <p className="flex items-center gap-2 text-xs text-muted-foreground"><RefreshCw className="h-3.5 w-3.5 animate-spin" />Przetwarzanie…</p>}
        </div>
      </div>

      {message && <p role="status" className="rounded-2xl border border-border bg-white px-4 py-3 text-sm">{message}</p>}
      {/* Summary bar */}
      <div className="card bg-sky-50 border-sky-200 flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-sm font-semibold text-sky-800">
            Odprawa: <span className="text-2xl font-bold">{checkedInCount}</span>
            <span className="text-sky-500"> / {participants.length}</span>
          </p>
          <p className="text-xs text-sky-600 mt-0.5">
            {formatPolishCount(checkedInCount, [
              'pies przeszedł odprawę',
              'psy przeszły odprawę',
              'psów przeszło odprawę',
            ])}
          </p>
          {eventClosed && (
            <p className="text-xs text-slate-500 mt-1">
              Zawody są zakończone. Odprawa jest tylko do podglądu.
            </p>
          )}
        </div>
        <button
          onClick={checkInAll}
          disabled={eventClosed || checkedInCount === participants.length}
          className="btn btn-primary btn-sm"
        >
          ✅ Zatwierdź wszystkich
        </button>
      </div>

      {/* Per-class lists */}
      {activeSizeClasses.map(cls => {
        const cps = participants.filter(p => p.sizeClass === cls.key)
        const doneCount = cps.filter(p => p.checkedIn).length
        return (
          <section key={cls.key}>
            <div className="flex items-center gap-2 mb-2">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                {cls.label}
              </h3>
              <span className={`badge ${doneCount === cps.length ? 'badge-green' : 'badge-yellow'}`}>
                {doneCount} / {cps.length}
              </span>
            </div>
            <div className="card p-0 overflow-hidden divide-y divide-slate-100">
              {cps.map(p => (
                <div
                  key={p.registrationId}
                  className={`flex items-center gap-3 px-4 py-3 transition-colors ${
                    p.checkedIn ? 'bg-green-50' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <p className={`font-semibold text-sm truncate ${p.checkedIn ? 'text-green-800' : 'text-slate-800'}`}>
                      {p.dogName || '—'}
                    </p>
                    <p className="text-xs text-slate-400 truncate">{p.ownerName || '—'}</p>
                  </div>
                  <button
                    onClick={() => toggleCheckIn(p)}
                    disabled={eventClosed || loading[p.registrationId]}
                    className={`shrink-0 w-28 text-center text-sm font-semibold py-2 px-3 rounded-lg transition-colors ${
                      p.checkedIn
                        ? 'bg-green-500 text-white hover:bg-green-600'
                        : 'bg-slate-200 text-slate-600 hover:bg-sky-100 hover:text-sky-700'
                    } disabled:opacity-60 disabled:cursor-not-allowed`}
                  >
                    {loading[p.registrationId]
                      ? '...'
                      : p.checkedIn
                        ? '✓ Odprawa'
                        : 'Odprawa'}
                  </button>
                </div>
              ))}
            </div>
          </section>
        )
      })}

      {participants.length === 0 && (
        <div className="card text-center py-12 text-slate-500">
          <p className="text-3xl mb-3">👥</p>
          <p>Brak potwierdzonych uczestników</p>
        </div>
      )}
    </div>
  )
}
