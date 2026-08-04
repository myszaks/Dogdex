'use client'

import { useState } from 'react'
import { Clock3, ListOrdered, Trash2 } from 'lucide-react'
import type { EventWaitlistEntry } from '@/types'
import { formatDate } from '@/lib/utils'

interface Props {
  initialEntries: EventWaitlistEntry[]
}

const statusLabel: Record<EventWaitlistEntry['status'], string> = {
  waiting: 'Czeka w kolejce',
  offered: 'Otrzymała propozycję',
  converted: 'Przeniesiona do zapisów',
  cancelled: 'Zrezygnowała',
  expired: 'Oferta wygasła',
}

export default function OrganizerWaitlistPanel({ initialEntries }: Props) {
  const [entries, setEntries] = useState(initialEntries)
  const [removing, setRemoving] = useState<string | null>(null)
  const activeEntries = entries.filter(entry => entry.status === 'waiting' || entry.status === 'offered')

  async function removeEntry(id: string) {
    setRemoving(id)
    const response = await fetch(`/api/event-waitlist/${id}`, { method: 'DELETE' })
    if (response.ok) {
      setEntries(current => current.map(entry => entry.id === id ? { ...entry, status: 'cancelled' } : entry))
    }
    setRemoving(null)
  }

  return (
    <section className="card mb-6 p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="flex items-center gap-2 font-heading text-lg font-semibold text-foreground">
            <ListOrdered className="h-5 w-5 text-accent" />
            Lista rezerwowa
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Zwolnione miejsca są proponowane automatycznie według kolejności zgłoszeń.
          </p>
        </div>
        <span className="rounded-full bg-secondary px-3 py-1 text-sm font-semibold">{activeEntries.length}</span>
      </div>

      {activeEntries.length === 0 ? (
        <p className="mt-5 rounded-xl bg-secondary/70 px-4 py-3 text-sm text-muted-foreground">Nikt nie czeka obecnie na miejsce.</p>
      ) : (
        <div className="mt-5 divide-y divide-border">
          {activeEntries.map((entry, index) => (
            <div key={entry.id} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="font-medium text-foreground">
                  {index + 1}. {entry.participants?.dog_name || 'Pies'}
                  {entry.participants?.owner_name && <span className="font-normal text-muted-foreground"> — {entry.participants.owner_name}</span>}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {entry.participants?.owner_email} · {statusLabel[entry.status]}
                </p>
                {entry.status === 'offered' && entry.offer_expires_at && (
                  <p className="mt-1 flex items-center gap-1 text-xs text-amber-700">
                    <Clock3 className="h-3.5 w-3.5" />Oferta ważna do {formatDate(entry.offer_expires_at)}
                  </p>
                )}
              </div>
              <button
                type="button"
                className="btn btn-secondary btn-sm shrink-0 text-red-700"
                disabled={removing === entry.id}
                onClick={() => removeEntry(entry.id)}
              >
                <Trash2 className="h-4 w-4" />
                {removing === entry.id ? 'Usuwanie…' : 'Usuń'}
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
