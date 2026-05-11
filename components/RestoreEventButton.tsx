'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function RestoreEventButton({ eventId }: { eventId: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleRestore() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/events/${eventId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'upcoming' }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.error ?? 'Błąd przywracania wydarzenia')
      }
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Błąd')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={handleRestore}
        disabled={loading}
        className="btn btn-sm btn-secondary text-green-600 hover:text-green-700 hover:border-green-300"
      >
        {loading ? '...' : '♻️ Przywróć'}
      </button>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  )
}
