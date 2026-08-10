'use client'

import { useState } from 'react'
import { Loader2, RotateCcw } from 'lucide-react'

export default function TrainingCommerceRefundButton({ paymentId, retry = false }: { paymentId: string; retry?: boolean }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function refund() {
    if (!window.confirm(retry ? 'Ponowić pełny zwrot przez Stripe?' : 'Zlecić pełny zwrot przez Stripe?')) return
    setLoading(true); setError(null)
    const response = await fetch(`/api/training-commerce/${paymentId}/refund`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reason: retry ? 'Ponowienie zwrotu z panelu płatności' : 'Zwrot z panelu płatności' }),
    })
    const data = await response.json(); setLoading(false)
    if (!response.ok) { setError(data.error ?? 'Nie udało się zlecić zwrotu'); return }
    window.location.reload()
  }

  return <div><button className="btn btn-secondary btn-sm text-red-700" disabled={loading} onClick={refund}>{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />} {retry ? 'Ponów zwrot' : 'Pełny zwrot'}</button>{error && <p role="alert" className="mt-2 text-xs text-red-700">{error}</p>}</div>
}
