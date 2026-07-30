'use client'

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { formatDateShort } from '@/lib/utils'
import type { Registration } from '@/types'
import ConfirmModal from '@/components/ConfirmModal'

interface Props {
  regId: string
  status: string
  multidateDates?: string[]
  onUpdated: (registration: Partial<Registration> & Pick<Registration, 'id'>) => void
}

const statusConfig: Record<string, { label: string; colorClass: string }> = {
  pending: {
    label: 'Oczekujące',
    colorClass: 'badge-yellow',
  },
  confirmed: {
    label: 'Potwierdzone',
    colorClass: 'badge-green',
  },
  cancelled: {
    label: 'Anulowane',
    colorClass: 'badge-red',
  },
}

function availableActions(status: string) {
  if (status === 'pending') {
    return [
      { status: 'confirmed', label: 'Potwierdź zapis' },
      { status: 'cancelled', label: 'Anuluj zapis', danger: true },
    ]
  }
  if (status === 'confirmed') {
    return [
      { status: 'pending', label: 'Ustaw jako oczekujący' },
      { status: 'cancelled', label: 'Anuluj zapis', danger: true },
    ]
  }
  return [
    { status: 'pending', label: 'Przywróć jako oczekujący' },
    { status: 'confirmed', label: 'Przywróć i potwierdź' },
  ]
}

export default function RegistrationStatusButton({
  regId,
  status,
  multidateDates,
  onUpdated,
}: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false)
  const [showMultidateCancel, setShowMultidateCancel] = useState(false)
  const [selectedDates, setSelectedDates] = useState<string[]>([])

  const config = statusConfig[status] ?? statusConfig.pending
  const hasMultidates = (multidateDates?.length ?? 0) > 0

  async function updateStatus(nextStatus: string, cancelledDates?: string[] | null) {
    setLoading(true)
    setError(null)
    try {
      const body: Record<string, unknown> = { status: nextStatus }
      if (cancelledDates !== undefined) body.cancelledDates = cancelledDates

      const response = await fetch(`/api/registrations/${regId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      const updated = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(updated.error ?? 'Nie udało się zmienić statusu')
      }
      onUpdated(updated)
      setMenuOpen(false)
      setConfirmCancelOpen(false)
      setShowMultidateCancel(false)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Nie udało się zmienić statusu')
    } finally {
      setLoading(false)
    }
  }

  function chooseAction(nextStatus: string) {
    setMenuOpen(false)
    setError(null)
    if (nextStatus !== 'cancelled') {
      void updateStatus(nextStatus)
      return
    }
    if (hasMultidates) {
      setSelectedDates([...(multidateDates ?? [])])
      setShowMultidateCancel(true)
      return
    }
    setConfirmCancelOpen(true)
  }

  function toggleDate(date: string) {
    setSelectedDates(previous =>
      previous.includes(date)
        ? previous.filter(candidate => candidate !== date)
        : [...previous, date]
    )
  }

  return (
    <>
      <div
        className="relative flex flex-col items-end gap-1"
        onKeyDown={event => {
          if (event.key === 'Escape') setMenuOpen(false)
        }}
      >
        <button
          type="button"
          onClick={() => setMenuOpen(previous => !previous)}
          disabled={loading}
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          aria-label={`Status zapisu: ${config.label}. Otwórz dostępne akcje`}
          className={`badge ${config.colorClass} inline-flex items-center gap-1 shrink-0 transition-opacity disabled:opacity-50`}
        >
          {loading ? 'Zapisywanie…' : config.label}
          {!loading && <ChevronDown className="w-3 h-3" aria-hidden="true" />}
        </button>

        {menuOpen && (
          <>
            <button
              type="button"
              className="fixed inset-0 z-20 cursor-default"
              aria-label="Zamknij menu zmiany statusu"
              onClick={() => setMenuOpen(false)}
            />
            <div
              role="menu"
              className="absolute right-0 top-full z-30 mt-1 w-56 rounded-xl border border-border bg-white p-1.5 shadow-lg"
            >
              <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Zmień status
              </p>
              {availableActions(status).map(action => (
                <button
                  key={action.status}
                  type="button"
                  role="menuitem"
                  onClick={() => chooseAction(action.status)}
                  className={`w-full rounded-lg px-2 py-2 text-left text-sm transition-colors ${
                    action.danger
                      ? 'text-red-600 hover:bg-red-50'
                      : 'text-foreground hover:bg-secondary'
                  }`}
                >
                  {action.label}
                </button>
              ))}
            </div>
          </>
        )}

        {error && <p className="max-w-56 text-right text-xs text-red-600">{error}</p>}
      </div>

      <ConfirmModal
        open={confirmCancelOpen}
        title="Anulować zapis?"
        message={
          error
            ? `Nie udało się anulować zapisu: ${error}`
            : 'Uczestnik straci miejsce na wydarzeniu i zniknie z odprawy, grafiku oraz listy wyników.'
        }
        confirmLabel="Anuluj zapis"
        cancelLabel="Wróć"
        danger
        onConfirm={() => void updateStatus('cancelled')}
        onCancel={() => setConfirmCancelOpen(false)}
      />

      {showMultidateCancel && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => !loading && setShowMultidateCancel(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={`cancel-registration-${regId}`}
            className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl"
            onClick={event => event.stopPropagation()}
          >
            <h2 id={`cancel-registration-${regId}`} className="mb-1 font-semibold text-slate-800">
              Anulowanie terminów
            </h2>
            <p className="mb-4 text-sm text-slate-500">
              Zaznaczone terminy zostaną anulowane. Możesz też anulować całe zgłoszenie.
            </p>
            <div className="mb-4 max-h-48 space-y-2 overflow-y-auto">
              {(multidateDates ?? []).map((date, index) => (
                <label key={date} htmlFor={`cancel-registration-date-${regId}-${index}`} className="flex cursor-pointer items-center gap-3">
                  <input
                    id={`cancel-registration-date-${regId}-${index}`}
                    type="checkbox"
                    checked={selectedDates.includes(date)}
                    onChange={() => toggleDate(date)}
                    className="h-4 w-4 rounded accent-sky-600"
                  />
                  <span className="text-sm text-slate-700">
                    {(() => {
                      try {
                        return formatDateShort(date)
                      } catch {
                        return date
                      }
                    })()}
                  </span>
                </label>
              ))}
            </div>
            {error && <p className="mb-3 text-xs text-red-600">{error}</p>}
            <div className="flex flex-col gap-2">
              <button
                type="button"
                disabled={selectedDates.length === 0 || loading}
                onClick={() => void updateStatus('cancelled', selectedDates)}
                className="btn btn-primary text-sm disabled:opacity-50"
              >
                {loading ? 'Zapisywanie…' : `Anuluj zaznaczone terminy (${selectedDates.length})`}
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={() => void updateStatus('cancelled', null)}
                className="btn btn-danger text-sm disabled:opacity-50"
              >
                Anuluj całe zgłoszenie
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={() => setShowMultidateCancel(false)}
                className="btn btn-secondary text-sm"
              >
                Wróć bez zmian
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
