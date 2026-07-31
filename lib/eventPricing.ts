import type { FormField } from '@/types'

export type EventPricingMode = 'free' | 'flat' | 'per_date'
export type EventDatePrices = Record<string, Record<string, number>>

export interface EventPricingSource {
  title: string
  pricing_mode?: EventPricingMode | null
  entry_fee?: number | null
  currency?: string | null
  date_prices?: unknown
  form_fields?: unknown
}

export interface EventPriceItemInput {
  itemKey: string
  kind: 'entry' | 'date'
  formFieldId: string | null
  occurrenceDate: string | null
  label: string
  amount: number
  currency: string
}

function isValidPrice(value: unknown): boolean {
  const amount = Number(value)
  return Number.isFinite(amount)
    && amount > 0
    && amount <= 100_000
    && Math.abs(amount * 100 - Math.round(amount * 100)) < 1e-6
}

function multidateFields(value: unknown): FormField[] {
  return Array.isArray(value)
    ? value.filter((field): field is FormField => (
        !!field
        && typeof field === 'object'
        && (field as { type?: unknown }).type === 'multidate'
        && typeof (field as { id?: unknown }).id === 'string'
      ))
    : []
}

export function normalizeEventDatePrices(value: unknown): EventDatePrices {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const result: EventDatePrices = {}
  for (const [fieldId, rawPrices] of Object.entries(value)) {
    if (!rawPrices || typeof rawPrices !== 'object' || Array.isArray(rawPrices)) continue
    const prices: Record<string, number> = {}
    for (const [date, rawAmount] of Object.entries(rawPrices)) {
      const amount = Number(rawAmount)
      if (Number.isFinite(amount)) prices[date] = amount
    }
    result[fieldId] = prices
  }
  return result
}

export function validateEventPricing(source: EventPricingSource): string | null {
  const mode = source.pricing_mode ?? 'free'
  if (!['free', 'flat', 'per_date'].includes(mode)) return 'Nieprawidłowy sposób naliczania opłat'
  if ((source.currency ?? 'PLN').toUpperCase() !== 'PLN') return 'Obecnie płatności za wydarzenia obsługują wyłącznie PLN'
  if (mode === 'free') return null
  if (mode === 'flat') {
    return isValidPrice(source.entry_fee)
      ? null
      : 'Wpisowe musi mieć maksymalnie 2 miejsca po przecinku, być większe od 0 i nie przekraczać 100 000 PLN'
  }

  const fields = multidateFields(source.form_fields)
  if (fields.length === 0) return 'Ceny za termin wymagają pola wyboru wielu dat'
  const prices = normalizeEventDatePrices(source.date_prices)
  for (const field of fields) {
    for (const date of field.options ?? []) {
      const amount = Number(prices[field.id]?.[date])
      if (!isValidPrice(amount)) {
        return `Ustaw prawidłową cenę dla terminu ${date}`
      }
    }
  }
  return null
}

export function buildEventPriceItems(
  source: EventPricingSource,
  formData: Record<string, unknown>,
): EventPriceItemInput[] {
  const mode = source.pricing_mode ?? 'free'
  const currency = (source.currency || 'PLN').toUpperCase()
  if (mode === 'free') return []
  const pricingError = validateEventPricing(source)
  if (pricingError) throw new Error(pricingError)

  if (mode === 'flat') {
    return [{
      itemKey: 'entry',
      kind: 'entry',
      formFieldId: null,
      occurrenceDate: null,
      label: `Wpisowe — ${source.title}`,
      amount: Number(source.entry_fee),
      currency,
    }]
  }

  const prices = normalizeEventDatePrices(source.date_prices)
  const items: EventPriceItemInput[] = []
  for (const field of multidateFields(source.form_fields)) {
    const selectedDates = Array.isArray(formData[field.id])
      ? [...new Set((formData[field.id] as unknown[]).filter((date): date is string => (
          typeof date === 'string' && (field.options ?? []).includes(date)
        )))]
      : []
    for (const date of selectedDates) {
      const amount = Number(prices[field.id]?.[date])
      if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error(`Brakuje ceny dla wybranego terminu ${date}`)
      }
      items.push({
        itemKey: `${field.id}:${date}`,
        kind: 'date',
        formFieldId: field.id,
        occurrenceDate: date,
        label: `${source.title} — ${date}`,
        amount,
        currency,
      })
    }
  }
  if (items.length === 0) throw new Error('Wybierz co najmniej jeden płatny termin')
  return items
}
