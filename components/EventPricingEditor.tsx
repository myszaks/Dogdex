'use client'

import type { FormField } from '@/types'
import type { EventDatePrices, EventPricingMode } from '@/lib/eventPricing'

interface Props {
  pricingMode: EventPricingMode
  entryFee: string
  datePrices: EventDatePrices
  formFields: FormField[]
  onPricingModeChange: (mode: EventPricingMode) => void
  onEntryFeeChange: (value: string) => void
  onDatePricesChange: (value: EventDatePrices) => void
}

export default function EventPricingEditor({
  pricingMode,
  entryFee,
  datePrices,
  formFields,
  onPricingModeChange,
  onEntryFeeChange,
  onDatePricesChange,
}: Props) {
  const multidateFields = formFields.filter(field => field.type === 'multidate' && (field.options?.length ?? 0) > 0)
  const enabled = pricingMode !== 'free'

  function setDatePrice(fieldId: string, date: string, rawValue: string) {
    const amount = rawValue === '' ? 0 : Number(rawValue)
    onDatePricesChange({
      ...datePrices,
      [fieldId]: {
        ...(datePrices[fieldId] ?? {}),
        [date]: Number.isFinite(amount) ? amount : 0,
      },
    })
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4 rounded-2xl border border-sage-200 bg-sage-50 p-4">
        <label htmlFor="event-payments-enabled" className="cursor-pointer">
          <span className="block font-semibold text-primary">Pobieraj płatność przez Stripe</span>
          <span className="mt-1 block text-sm text-muted-foreground">Środki trafią bezpośrednio na konto Stripe organizatora.</span>
        </label>
        <input
          id="event-payments-enabled"
          type="checkbox"
          checked={enabled}
          onChange={event => onPricingModeChange(event.target.checked ? 'flat' : 'free')}
          className="h-5 w-5 accent-orange-500"
        />
      </div>

      {enabled && multidateFields.length > 0 && (
        <div>
          <label htmlFor="event-pricing-mode" className="form-label">Sposób naliczania</label>
          <select
            id="event-pricing-mode"
            value={pricingMode}
            onChange={event => onPricingModeChange(event.target.value as EventPricingMode)}
            className="form-input"
          >
            <option value="flat">Jedna opłata za cały zapis</option>
            <option value="per_date">Osobna cena za każdy wybrany termin</option>
          </select>
        </div>
      )}

      {pricingMode === 'flat' && (
        <div>
          <label htmlFor="event-entry-fee" className="form-label">Wpisowe (PLN) *</label>
          <input
            id="event-entry-fee"
            type="number"
            min="0.01"
            max="100000"
            step="0.01"
            value={entryFee}
            onChange={event => onEntryFeeChange(event.target.value)}
            className="form-input"
            placeholder="100.00"
          />
        </div>
      )}

      {pricingMode === 'per_date' && (
        <div className="space-y-4">
          {multidateFields.map(field => (
            <div key={field.id} className="rounded-2xl border border-sage-200 bg-sage-50 p-4">
              <p className="font-semibold text-primary">{field.label}</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {(field.options ?? []).map(date => {
                  const inputId = `event-date-price-${field.id}-${date}`
                  return (
                  <label key={date} htmlFor={inputId} className="text-sm text-sage-700">
                    {new Intl.DateTimeFormat('pl-PL', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`))}
                    <span className="relative mt-1 block">
                      <input
                        id={inputId}
                        type="number"
                        min="0.01"
                        max="100000"
                        step="0.01"
                        value={datePrices[field.id]?.[date] || ''}
                        onChange={event => setDatePrice(field.id, date, event.target.value)}
                        className="form-input pr-14"
                        placeholder="0.00"
                      />
                      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 font-semibold text-accent">PLN</span>
                    </span>
                  </label>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
