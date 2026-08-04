'use client'

import { useEffect, useState } from 'react'
import { Clock3, ListOrdered } from 'lucide-react'
import useUser from '@/hooks/useUser'

interface Props { eventId: string }

interface WaitlistEntry {
  id: string
  status: 'waiting' | 'offered'
  position: number
  offer_expires_at: string | null
  participants?: { dog_name?: string | null; dog_breed?: string | null } | null
}

export default function UserWaitlistStatus({ eventId }: Props) {
  const { user } = useUser()
  const [entries, setEntries] = useState<WaitlistEntry[]>([])
  const [cancelling, setCancelling] = useState<string | null>(null)

  useEffect(() => {
    if (!user) {
      return
    }
    fetch(`/api/event-waitlist/mine?eventId=${eventId}`)
      .then(response => response.ok ? response.json() : [])
      .then(data => setEntries(Array.isArray(data) ? data : []))
      .catch(() => setEntries([]))
  }, [eventId, user])

  async function cancel(id: string) {
    setCancelling(id)
    const response = await fetch(`/api/event-waitlist/${id}`, { method: 'DELETE' })
    if (response.ok) setEntries(current => current.filter(entry => entry.id !== id))
    setCancelling(null)
  }

  if (!user || entries.length === 0) return null

  return (
    <div className="space-y-2">
      {entries.map(entry => {
        const participant = Array.isArray(entry.participants) ? entry.participants[0] : entry.participants
        return (
          <div key={entry.id} className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm">
            <p className="flex items-center gap-2 font-semibold text-amber-900">
              {entry.status === 'offered' ? <Clock3 className="h-4 w-4" /> : <ListOrdered className="h-4 w-4" />}
              {entry.status === 'offered' ? 'Czeka na Twoje potwierdzenie' : `Lista rezerwowa — pozycja ${entry.position}`}
            </p>
            {participant?.dog_name && <p className="mt-1 text-amber-800">Pies: {participant.dog_name}</p>}
            <button
              type="button"
              onClick={() => cancel(entry.id)}
              disabled={cancelling === entry.id}
              className="mt-3 text-xs font-medium text-red-700 hover:underline disabled:opacity-50"
            >
              {cancelling === entry.id ? 'Usuwanie…' : 'Usuń z listy rezerwowej'}
            </button>
          </div>
        )
      })}
    </div>
  )
}
