'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function CancelEventButton({ eventId }: { eventId: string }) {
  const router = useRouter()
  const [confirm, setConfirm] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleCancel() {
    if (!confirm) {
      setConfirm(true)
      setTimeout(() => setConfirm(false), 4000)
      return
    }
    setLoading(true)
    try {
      await fetch(`/api/events/${eventId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'cancelled' }),
      })
      router.refresh()
    } finally {
      setLoading(false)
      setConfirm(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handleCancel}
      disabled={loading}
      className={`btn btn-sm transition-colors ${
        confirm
          ? 'bg-red-500 text-white border-red-500 hover:bg-red-600'
          : 'btn-secondary text-red-500 hover:text-red-700 hover:border-red-300'
      }`}
    >
      {loading ? '...' : confirm ? '⚠️ Potwierdź odwołanie' : '🚫 Odwołaj'}
    </button>
  )
}
