'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function RestoreEventButton({ eventId }: { eventId: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function handleRestore() {
    setLoading(true)
    try {
      await fetch(`/api/events/${eventId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'upcoming' }),
      })
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handleRestore}
      disabled={loading}
      className="btn btn-sm btn-secondary text-green-600 hover:text-green-700 hover:border-green-300"
    >
      {loading ? '...' : '♻️ Przywróć'}
    </button>
  )
}
