'use client'
import { useState } from 'react'

interface Props {
  eventId: string
  currentIndex: number
  totalCount: number
}

export default function NextStartButton({ eventId, currentIndex, totalCount }: Props) {
  const [index, setIndex] = useState(currentIndex)
  const [loading, setLoading] = useState(false)

  async function advance(action: 'next' | 'prev') {
    setLoading(true)
    const res = await fetch(`/api/events/${eventId}/start-index`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    })
    if (res.ok) {
      const data = await res.json()
      setIndex(data.current_start_index)
    }
    setLoading(false)
  }

  return (
    <div className="card bg-blue-50 border-blue-200 flex items-center gap-3 flex-wrap mb-5">
      <div>
        <p className="text-xs text-blue-500 uppercase tracking-wide font-medium">Aktualny zawodnik</p>
        <p className="text-lg font-bold text-blue-800">
          {index + 1} <span className="text-sm font-normal text-blue-500">/ {totalCount}</span>
        </p>
      </div>
      <div className="flex gap-2 ml-auto">
        <button
          onClick={() => advance('prev')}
          disabled={loading || index <= 0}
          className="btn btn-secondary btn-sm"
        >
          ← Poprzedni
        </button>
        <button
          onClick={() => advance('next')}
          disabled={loading || index >= totalCount - 1}
          className="btn btn-primary btn-sm"
        >
          Następny →
        </button>
      </div>
    </div>
  )
}
