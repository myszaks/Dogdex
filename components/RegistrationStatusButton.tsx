'use client'
import { useState } from 'react'

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
  const [currentStatus, setCurrentStatus] = useState(status)
  const [loading, setLoading] = useState(false)

  const config = statusConfig[currentStatus] ?? statusConfig.pending

  async function toggle() {
    if (loading) return
    setLoading(true)
    try {
      const res = await fetch(`/api/registrations/${regId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: config.next }),
      })
      if (res.ok) setCurrentStatus(config.next)
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={toggle}
      disabled={loading}
      title="Kliknij aby zmienić status"
      className={`badge ${config.colorClass} shrink-0 transition-opacity disabled:opacity-50`}
    >
      {loading ? '...' : config.label}
    </button>
  )
}
