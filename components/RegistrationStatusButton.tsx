'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatDateShort } from '@/lib/utils'

interface Props {
  regId: string
  status: string
  /** Dates available in the registration's multidate fields. If non-empty, show partial cancel dialog. */
  multidateDates?: string[]
}

const statusConfig: Record<string, { label: string; next: string; colorClass: string }> = {
  pending: {
    label: 'Oczekujące',
    next: 'confirmed',
    colorClass: 'badge-yellow cursor-pointer hover:opacity-80',
  },
  confirmed: {
    label: 'Potwierdzone',
    next: 'cancelled',
    colorClass: 'badge-green cursor-pointer hover:opacity-80',
  },
  cancelled: {
    label: 'Anulowane',
    next: 'pending',
    colorClass: 'badge-red cursor-pointer hover:opacity-80',
  },
}

export default function RegistrationStatusButton({ regId, status, multidateDates }: Props) {
  const router = useRouter()
  const [currentStatus, setCurrentStatus] = useState(status)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [selectedDates, setSelectedDates] = useState<string[]>([])

  const config = statusConfig[currentStatus] ?? statusConfig.pending
  const hasMultidates = (multidateDates?.length ?? 0) > 0

  async function performCancel(cancelledDates: string[] | null) {
    setLoading(true)
    setError(null)
    try {
      const body: Record<string, unknown> = { status: 'cancelled' }
      if (cancelledDates !== null) {
        body.cancelledDates = cancelledDates
      }
      const res = await fetch(`/api/registrations/${regId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.error ?? 'Błąd zmiany statusu')
      }
      const updated = await res.json()
      setCurrentStatus(updated.status ?? 'cancelled')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Błąd')
    } finally {
      setLoading(false)
      setShowCancelModal(false)
    }
  }

  async function toggle() {
    if (loading) return
    const next = config.next
    if (next === 'cancelled' && hasMultidates) {
      setSelectedDates([...(multidateDates ?? [])])
      setShowCancelModal(true)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/registrations/${regId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: next }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.error ?? 'Błąd zmiany statusu')
      }
      setCurrentStatus(next)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Błąd')
    } finally {
      setLoading(false)
    }
  }

  function toggleDate(d: string) {
    setSelectedDates(prev =>
      prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]
    )
  }

  return (
    <>
      <div className="flex flex-col items-end gap-0.5">
        <button
          onClick={toggle}
          disabled={loading}
          title="Kliknij aby zmienić status"
          className={`badge ${config.colorClass} shrink-0 transition-opacity disabled:opacity-50`}
        >
          {loading ? '...' : config.label}
        </button>
        {error && <p className="text-xs text-red-500 text-right">{error}</p>}
      </div>

      {/* Multidate cancel modal */}
      {showCancelModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setShowCancelModal(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6"
            onClick={e => e.stopPropagation()}
          >
            <h2 className="font-semibold text-slate-800 mb-1">Anulowanie zapisu</h2>
            <p className="text-sm text-slate-500 mb-4">
              Wybierz daty do anulowania lub anuluj całe zgłoszenie:
            </p>
            <div className="space-y-2 mb-4 max-h-48 overflow-y-auto">
              {(multidateDates ?? []).map(d => (
                <label key={d} className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedDates.includes(d)}
                    onChange={() => toggleDate(d)}
                    className="w-4 h-4 rounded accent-sky-600"
                  />
                  <span className="text-sm text-slate-700">
                    {(() => { try { return formatDateShort(d) } catch { return d } })()}
                  </span>
                </label>
              ))}
            </div>
            <div className="flex flex-col gap-2">
              <button
                disabled={selectedDates.length === 0 || loading}
                onClick={() => performCancel(selectedDates)}
                className="btn btn-primary text-sm disabled:opacity-50"
              >
                {loading ? '...' : `Anuluj zaznaczone daty (${selectedDates.length})`}
              </button>
              <button
                disabled={loading}
                onClick={() => performCancel(null)}
                className="btn btn-danger text-sm disabled:opacity-50"
              >
                {loading ? '...' : 'Anuluj całe zgłoszenie'}
              </button>
              <button
                disabled={loading}
                onClick={() => setShowCancelModal(false)}
                className="btn btn-secondary text-sm"
              >
                Nie anuluj
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
