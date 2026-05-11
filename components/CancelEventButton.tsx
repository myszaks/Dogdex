'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function CancelEventButton({ eventId }: { eventId: string }) {
  const router = useRouter()
  const [confirm, setConfirm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleCancel() {
    if (!confirm) {
      setConfirm(true)
      setTimeout(() => setConfirm(false), 4000)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/events/${eventId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'cancelled' }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.error ?? 'Błąd odwołania wydarzenia')
      }
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Błąd')
    } finally {
      setLoading(false)
      setConfirm(false)
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
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
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  )
}
