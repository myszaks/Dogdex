'use client'
import { useState } from 'react'

interface CheckInParticipant {
  registrationId: string
  participantId: string
  dogName: string
  ownerName: string
  sizeClass: string
  checkedIn: boolean
}

interface Props {
  initialParticipants: CheckInParticipant[]
  classOptions: Array<{ key: string; label: string }>
  eventClosed: boolean
}

export default function CheckInClient({
  initialParticipants,
  classOptions,
  eventClosed,
}: Props) {
  const [participants, setParticipants] = useState(initialParticipants)
  const [loading, setLoading] = useState<Record<string, boolean>>({})

  const checkedInCount = participants.filter(p => p.checkedIn).length

  const activeSizeClasses = [
    ...classOptions.filter(option => participants.some(p => p.sizeClass === option.key)),
    ...(
      participants.some(participant => participant.sizeClass === '__unassigned')
        ? [{ key: '__unassigned', label: 'Brak przypisanej klasy' }]
        : []
    ),
  ]

  async function toggleCheckIn(p: CheckInParticipant) {
    if (eventClosed) return
    const newVal = !p.checkedIn
    setLoading(prev => ({ ...prev, [p.registrationId]: true }))
    try {
      const res = await fetch(`/api/registrations/${p.registrationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checked_in: newVal }),
      })
      if (!res.ok) {
        const json = await res.json()
        alert(json.error ?? 'Błąd serwera')
        return
      }
      setParticipants(prev =>
        prev.map(x => x.registrationId === p.registrationId ? { ...x, checkedIn: newVal } : x)
      )
    } finally {
      setLoading(prev => ({ ...prev, [p.registrationId]: false }))
    }
  }

  async function checkInAll() {
    if (eventClosed) return
    const notIn = participants.filter(p => !p.checkedIn)
    for (const p of notIn) {
      setLoading(prev => ({ ...prev, [p.registrationId]: true }))
      try {
        const res = await fetch(`/api/registrations/${p.registrationId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ checked_in: true }),
        })
        if (res.ok) {
          setParticipants(prev =>
            prev.map(x => x.registrationId === p.registrationId ? { ...x, checkedIn: true } : x)
          )
        }
      } finally {
        setLoading(prev => ({ ...prev, [p.registrationId]: false }))
      }
    }
  }

  return (
    <div className="space-y-6">
      {/* Summary bar */}
      <div className="card bg-sky-50 border-sky-200 flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-sm font-semibold text-sky-800">
            Odprawa: <span className="text-2xl font-bold">{checkedInCount}</span>
            <span className="text-sky-500"> / {participants.length}</span>
          </p>
          <p className="text-xs text-sky-600 mt-0.5">psów przeszło odprawę</p>
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
