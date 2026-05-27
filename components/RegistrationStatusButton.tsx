'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  regId: string
  status: string
}

const statusConfig: Record<string, { label: string; next: string; colorClass: string }> = {
  pending: {
    label: 'Oczekujące',
    next: 'confirmed',
    colorClass: 'badge-yellow cursor-pointer hover:opacity-80',
  },
  confirmed: {
    label: 'Potwierdzone',
    next: 'cancelled',
    colorClass: 'badge-green cursor-pointer hover:opacity-80',
  },
  cancelled: {
    label: 'Anulowane',
    next: 'pending',
    colorClass: 'badge-red cursor-pointer hover:opacity-80',
  },
}

export default function RegistrationStatusButton({ regId, status }: Props) {
  const router = useRouter()
  const [currentStatus, setCurrentStatus] = useState(status)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const config = statusConfig[currentStatus] ?? statusConfig.pending

  async function toggle() {
    if (loading) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/registrations/${regId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: config.next }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.error ?? 'Błąd zmiany statusu')
      }
      setCurrentStatus(config.next)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Błąd')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-0.5">
      <button
        onClick={toggle}
        disabled={loading}
        title="Kliknij aby zmienić status"
        className={`badge ${config.colorClass} shrink-0 transition-opacity disabled:opacity-50`}
      >
        {loading ? '...' : config.label}
      </button>
      {error && <p className="text-xs text-red-500 text-right">{error}</p>}
    </div>
  )
}
