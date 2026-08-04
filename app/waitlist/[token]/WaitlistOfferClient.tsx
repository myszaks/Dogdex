'use client'

import { useState } from 'react'
import Link from 'next/link'
import { CalendarDays, CheckCircle2, Clock3, MapPin, XCircle } from 'lucide-react'
import { formatDate } from '@/lib/utils'

interface Props {
  token: string
  initialStatus: string
  expiresAt: string | null
  event: { title: string; slug: string; start_at: string | null; location: string | null }
  dogName: string
}

export default function WaitlistOfferClient({ token, initialStatus, expiresAt, event, dogName }: Props) {
  const expired = !expiresAt || new Date(expiresAt) <= new Date()
  const [status, setStatus] = useState(expired && initialStatus === 'offered' ? 'expired' : initialStatus)
  const [loading, setLoading] = useState<'accept' | 'decline' | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function submit(action: 'accept' | 'decline') {
    setLoading(action)
    setError(null)
    try {
      const response = await fetch(`/api/event-waitlist/offers/${token}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error ?? 'Nie udało się zapisać decyzji')
      if (data.checkoutUrl) {
        window.location.assign(data.checkoutUrl)
        return
      }
      setStatus(action === 'decline' ? 'cancelled' : 'converted')
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Nie udało się zapisać decyzji')
    } finally {
      setLoading(null)
    }
  }

  const active = status === 'offered' && !expired

  return (
    <main className="mx-auto max-w-xl py-10 sm:py-16">
      <div className="card space-y-6 p-6 sm:p-8">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Lista rezerwowa</p>
          <h1 className="mt-2 font-heading text-3xl font-bold text-foreground">
            {active ? 'Zwolniło się dla Ciebie miejsce' : status === 'converted' ? 'Miejsce zostało potwierdzone' : 'Propozycja jest już nieaktywna'}
          </h1>
          <p className="mt-3 text-muted-foreground">
            {active
              ? `Miejsce dla psa ${dogName} czeka na Twoją decyzję.`
              : status === 'converted'
                ? `Pies ${dogName} został przeniesiony z listy rezerwowej do zapisów.`
                : 'Miejsce zostało przekazane kolejnej osobie albo propozycja została odrzucona.'}
          </p>
        </div>

        <div className="rounded-2xl bg-secondary p-5">
          <p className="font-heading text-lg font-semibold">{event.title}</p>
          <div className="mt-3 space-y-2 text-sm text-muted-foreground">
            {event.start_at && <p className="flex items-center gap-2"><CalendarDays className="h-4 w-4" />{formatDate(event.start_at)}</p>}
            {event.location && <p className="flex items-center gap-2"><MapPin className="h-4 w-4" />{event.location}</p>}
            {active && expiresAt && <p className="flex items-center gap-2 text-amber-700"><Clock3 className="h-4 w-4" />Potwierdź do {formatDate(expiresAt)}</p>}
          </div>
        </div>

        {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

        {active ? (
          <div className="flex flex-col gap-3 sm:flex-row">
            <button className="btn btn-primary flex-1" disabled={loading !== null} onClick={() => submit('accept')}>
              <CheckCircle2 className="h-4 w-4" />
              {loading === 'accept' ? 'Potwierdzanie…' : 'Potwierdzam udział'}
            </button>
            <button className="btn btn-secondary flex-1" disabled={loading !== null} onClick={() => submit('decline')}>
              <XCircle className="h-4 w-4" />
              {loading === 'decline' ? 'Zapisywanie…' : 'Rezygnuję z miejsca'}
            </button>
          </div>
        ) : (
          <Link href={`/events/${event.slug}`} className="btn btn-primary w-full">Zobacz wydarzenie</Link>
        )}
      </div>
    </main>
  )
}
