import { Banknote, BadgeCheck, Clock3 } from 'lucide-react'
import type { FormField } from '@/types'
import type { EventDatePrices, EventPricingMode } from '@/lib/eventPricing'
import { formatDateShort } from '@/lib/utils'

interface Props {
  pricingMode?: EventPricingMode
  entryFee?: number | null
  datePrices?: EventDatePrices
  currency?: string
  autoConfirm?: boolean
  formFields?: FormField[]
  className?: string
}

function money(amount: number, currency: string) {
  return Number(amount).toLocaleString('pl-PL', { style: 'currency', currency })
}

export default function EventRegistrationTerms({
  pricingMode = 'free',
  entryFee = null,
  datePrices = {},
  currency = 'PLN',
  autoConfirm = false,
  formFields = [],
  className = '',
}: Props) {
  const dateRows = pricingMode === 'per_date'
    ? formFields
        .filter(field => field.type === 'multidate')
        .flatMap(field => (field.options ?? []).map(date => ({
          key: `${field.id}:${date}`,
          date,
          amount: Number(datePrices[field.id]?.[date] ?? 0),
        })))
        .filter(row => row.amount > 0)
    : []

  const paymentLabel = pricingMode === 'free'
    ? 'Wydarzenie bezpłatne'
    : pricingMode === 'flat'
      ? `Płatne: ${money(Number(entryFee ?? 0), currency)}`
      : 'Płatne osobno za każdy wybrany termin'

  return (
    <div className={`rounded-2xl border border-border bg-secondary/50 p-4 text-sm ${className}`}>
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Warunki zapisu</p>
      <div className="space-y-2">
        <div className="flex items-start gap-2">
          <Banknote className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
          <span className="font-semibold text-foreground">{paymentLabel}</span>
        </div>
        <div className="flex items-start gap-2">
          {autoConfirm
            ? <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
            : <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />}
          <span className="text-foreground">
            {autoConfirm
              ? 'Zapis jest potwierdzany automatycznie.'
              : 'Zapis wymaga akceptacji organizatora.'}
          </span>
        </div>
        {pricingMode !== 'free' && (
          <p className="pl-6 text-xs text-muted-foreground">
            {autoConfirm
              ? 'Po wysłaniu formularza przejdziesz do bezpiecznej płatności Stripe.'
              : 'Link do płatności otrzymasz dopiero po zaakceptowaniu zapisu.'}
          </p>
        )}
      </div>

      {dateRows.length > 0 && (
        <div className="mt-3 border-t border-border pt-3">
          <p className="mb-2 text-xs font-semibold text-muted-foreground">Ceny terminów</p>
          <div className="space-y-1.5">
            {dateRows.map(row => (
              <div key={row.key} className="flex items-center justify-between gap-3 text-xs">
                <span>{formatDateShort(row.date)}</span>
                <strong>{money(row.amount, currency)}</strong>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
