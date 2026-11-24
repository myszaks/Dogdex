'use client'

import { useState } from 'react'
import type { FormField } from '@/types'
import { formatDateShort } from '@/lib/utils'

interface Props {
  registrationId: string
  formFields: FormField[]
  formData: Record<string, unknown> | null | undefined
  onSuccess: () => void
  onCancel: () => void
}

export default function CancellationRequestForm({ registrationId, formFields, formData, onSuccess, onCancel }: Props) {
  const [selectedDates, setSelectedDates] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dates = [...new Set(formFields.filter(field => field.type === 'multidate').flatMap(field => {
    const value = formData?.[field.id]
    const values = Array.isArray(value) ? value : [value]
    return values.filter((date): date is string => typeof date === 'string' && date.length > 0)
  }))].sort()

  async function submit() {
    if (submitting || (dates.length > 0 && selectedDates.length === 0)) return
    setSubmitting(true)
    setError(null)
    try {
      const response = await fetch(`/api/registrations/${registrationId}/cancel-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dates.length > 0 ? { cancelled_dates: selectedDates } : {}),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) {
        setError(result.error ?? 'Nie udało się wysłać wniosku o rezygnację')
        return
      }
      onSuccess()
    } catch {
      setError('Nie udało się wysłać wniosku o rezygnację. Spróbuj ponownie.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-4">
      {dates.length > 0 ? (
        <fieldset disabled={submitting} className="space-y-2">
          <legend className="text-sm font-medium mb-2">Wybierz terminy, z których chcesz zrezygnować:</legend>
          <button type="button" className="text-sm underline disabled:opacity-50"
            onClick={() => setSelectedDates(selectedDates.length === dates.length ? [] : dates)}>
            {selectedDates.length === dates.length ? 'Odznacz wszystkie' : 'Zaznacz wszystkie'}
          </button>
          {dates.map(date => (
            <label key={date} htmlFor={`cancel-date-${registrationId}-${date}`} className="flex items-center gap-3 cursor-pointer">
              <input id={`cancel-date-${registrationId}-${date}`} type="checkbox" className="w-4 h-4 accent-red-500"
                checked={selectedDates.includes(date)}
                onChange={() => setSelectedDates(previous => previous.includes(date)
                  ? previous.filter(selected => selected !== date) : [...previous, date])} />
              <span className="text-sm">{formatDateShort(date)}</span>
            </label>
          ))}
          <p className="text-xs text-muted-foreground">
            Rezygnacja ze wszystkich terminów spowoduje anulowanie całego zgłoszenia po akceptacji organizatora.
          </p>
        </fieldset>
      ) : (
        <p className="text-sm">Czy na pewno chcesz wycofać ten zapis na wydarzenie?</p>
      )}
      <p className="text-xs text-muted-foreground">Wniosek wymaga akceptacji organizatora.</p>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={submit}
          disabled={submitting || (dates.length > 0 && selectedDates.length === 0)}
          className="btn btn-danger btn-sm disabled:opacity-50">
          {submitting ? 'Wysyłam…' : 'Wyślij wniosek o rezygnację'}
        </button>
        <button type="button" onClick={onCancel} disabled={submitting} className="btn btn-secondary btn-sm">Wróć</button>
      </div>
    </div>
  )
}
