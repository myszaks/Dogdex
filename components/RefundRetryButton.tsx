'use client'

import { useState } from 'react'

export default function RefundRetryButton({ refundId }: { refundId: string }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function retry() {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`/api/event-refunds/${refundId}/retry`, { method: 'POST' })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error ?? 'Nie udało się ponowić zwrotu')
      window.location.reload()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Nie udało się ponowić zwrotu')
    } finally {
      setLoading(false)
    }
  }
  return <div className="text-right"><button type="button" onClick={() => void retry()} disabled={loading} className="btn btn-secondary px-3 py-1.5 text-xs">{loading ? 'Ponawianie…' : 'Ponów zwrot'}</button>{error && <p className="mt-1 text-xs text-red-600">{error}</p>}</div>
}
