'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Download, RefreshCw } from 'lucide-react'

export default function PaymentsActions() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [messageType, setMessageType] = useState<'success' | 'error'>('success')

  async function reconcile() {
    setLoading(true)
    setMessage(null)
    try {
      const response = await fetch('/api/event-payments/reconcile', { method: 'POST' })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error ?? 'Nie udało się uzgodnić płatności')
      setMessageType('success')
      setMessage(`Uzgadnianie zakończone. Sprawdzono: ${result.checked ?? 0}, poprawiono: ${result.corrected ?? 0}, wymagają uwagi: ${result.attention ?? 0}.`)
      router.refresh()
    } catch (error) {
      setMessageType('error')
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
      {message && (
        <p
          role="status"
          aria-live="polite"
          className={`w-full rounded-xl border px-3 py-2 text-left text-xs font-medium ${
            messageType === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-red-200 bg-red-50 text-red-700'
          }`}
        >
          {message}
        </p>
      )}
    </div>
  )
}
