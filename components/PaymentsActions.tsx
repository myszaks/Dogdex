'use client'

import { useState } from 'react'
import { Download, RefreshCw } from 'lucide-react'

export default function PaymentsActions() {
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function reconcile() {
    setLoading(true)
    setMessage(null)
    try {
      const response = await fetch('/api/event-payments/reconcile', { method: 'POST' })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error ?? 'Nie udało się uzgodnić płatności')
      setMessage(`Sprawdzono: ${result.checked ?? 0}, poprawiono: ${result.corrected ?? 0}, wymagają uwagi: ${result.attention ?? 0}.`)
      window.setTimeout(() => window.location.reload(), 900)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Nie udało się uzgodnić płatności')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <a href="/api/event-payments/export" className="btn btn-secondary text-sm">
        <Download className="h-4 w-4" /> Eksport CSV
      </a>
      <button type="button" onClick={() => void reconcile()} disabled={loading} className="btn btn-secondary text-sm">
        <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        {loading ? 'Uzgadnianie…' : 'Uzgodnij ze Stripe'}
      </button>
      {message && <p className="w-full text-right text-xs text-muted-foreground">{message}</p>}
    </div>
  )
}
