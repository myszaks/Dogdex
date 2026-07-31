'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import RegisterForm from './RegisterForm'
import type { FormField } from '@/types'
import type { EventDatePrices, EventPricingMode } from '@/lib/eventPricing'
import { X } from 'lucide-react'

import type { ReactNode } from 'react'

interface Props {
  eventId: string
  eventTitle: string
  formFields: FormField[]
  pricingMode?: EventPricingMode
  entryFee?: number | null
  datePrices?: EventDatePrices
  currency?: string
  autoConfirm?: boolean
  triggerClassName?: string
  triggerLabel?: ReactNode
}

export default function RegisterModal({ eventId, eventTitle, formFields, pricingMode = 'free', entryFee = null, datePrices = {}, currency = 'PLN', autoConfirm = false, triggerClassName, triggerLabel }: Props) {
  const [open, setOpen] = useState(false)
  const router = useRouter()

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={triggerClassName ?? 'btn btn-primary btn-sm'}>
        {triggerLabel ?? 'Zapisz się'}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/40 backdrop-blur-sm"
          onClick={e => { if (e.target === e.currentTarget) setOpen(false) }}
        >
          <div className="bg-card rounded-t-3xl sm:rounded-3xl shadow-2xl border border-border w-full sm:max-w-lg max-h-[92dvh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-5 border-b border-border shrink-0">
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold mb-0.5">Zapis na wydarzenie</p>
                <h2 className="font-heading font-semibold text-foreground truncate">{eventTitle}</h2>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="w-8 h-8 rounded-xl bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-border transition-colors shrink-0 ml-3"
                aria-label="Zamknij"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              <RegisterForm
                eventId={eventId}
                formFields={formFields}
                pricingMode={pricingMode}
                entryFee={entryFee}
                datePrices={datePrices}
                currency={currency}
                autoConfirm={autoConfirm}
                onSuccess={() => {
                  router.refresh()
                  setTimeout(() => setOpen(false), 2500)
                }}
              />
            </div>
          </div>
        </div>
      )}
    </>
  )
}

