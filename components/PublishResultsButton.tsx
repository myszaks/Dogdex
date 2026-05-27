'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  eventId: string
  resultsPublic: boolean
}

export default function PublishResultsButton({ eventId, resultsPublic }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function toggle() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/events/${eventId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ results_public: !resultsPublic }),
      })
      if (!res.ok) {
        const json = await res.json()
        throw new Error(json.error ?? 'Błąd serwera')
      }
      router.refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Nieznany błąd')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="card mb-5 border-2 border-dashed border-amber-300 bg-amber-50">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <p className="font-semibold text-amber-800">
            {resultsPublic ? '✅ Wyniki są publiczne' : '🔒 Wyniki są ukryte'}
          </p>
          <p className="text-xs text-amber-600 mt-0.5">
            {resultsPublic
              ? 'Uczestnicy mogą zobaczyć wyniki na stronie wydarzenia.'
              : 'Wyniki nie są jeszcze widoczne dla uczestników.'}
          </p>
          {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
        </div>
        <button
          onClick={toggle}
          disabled={loading}
          className={resultsPublic ? 'btn btn-secondary btn-sm' : 'btn btn-primary btn-sm'}
        >
          {loading ? '...' : resultsPublic ? 'Ukryj wyniki' : 'Opublikuj wyniki'}
        </button>
      </div>
    </div>
  )
}
