'use client'

import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, Eye, EyeOff, Star, Trash2 } from 'lucide-react'

interface ReviewReport {
  id: string
  review_type: 'event' | 'training'
  reason: string
  details: string | null
  status: 'pending' | 'dismissed' | 'actioned'
  created_at: string
  resolution_note: string | null
  review: {
    id: string
    author_name: string
    rating: number
    comment: string | null
    moderation_status: 'published' | 'hidden' | 'removed'
  } | null
}

const reasonLabels: Record<string, string> = {
  spam: 'Spam lub reklama',
  offensive: 'Treść obraźliwa',
  privacy: 'Naruszenie prywatności',
  conflict: 'Konflikt interesów',
  other: 'Inny powód',
}

export default function AdminReviewReportsClient() {
  const [reports, setReports] = useState<ReviewReport[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const response = await fetch('/api/review-reports')
    const data = await response.json().catch(() => null)
    if (!response.ok) setError(data?.error ?? 'Nie udało się pobrać zgłoszeń')
    else setReports(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => { void load() }, 0)
    return () => window.clearTimeout(timer)
  }, [load])

  async function decide(id: string, action: 'dismiss' | 'hide' | 'remove' | 'restore') {
    const note = action === 'dismiss' ? 'Brak podstaw do ukrycia opinii' : undefined
    setBusy(id)
    const response = await fetch(`/api/review-reports/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, note }),
    })
    const data = await response.json().catch(() => null)
    setBusy(null)
    if (!response.ok) return setError(data?.error ?? 'Nie udało się zapisać decyzji')
    await load()
  }

  if (loading) return <div className="card p-6 text-muted-foreground">Ładowanie zgłoszeń…</div>

  return (
    <div className="space-y-6">
      <div>
        <p className="section-eyebrow">Bezpieczeństwo społeczności</p>
        <h1 className="page-title">Moderacja opinii</h1>
        <p className="mt-2 text-muted-foreground">Zgłoszenia są zachowane wraz z decyzją. Ukrycie lub usunięcie wyłącza opinię z publicznego profilu i średniej ocen.</p>
      </div>
      {error && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-red-700">{error}</div>}
      {reports.length === 0 ? (
        <div className="card p-8 text-center text-muted-foreground"><CheckCircle2 className="mx-auto mb-3 h-8 w-8 text-emerald-600" />Brak zgłoszonych opinii.</div>
      ) : (
        <div className="space-y-4">
          {reports.map(report => (
            <article key={report.id} className="card p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${report.status === 'pending' ? 'bg-amber-100 text-amber-800' : 'bg-secondary text-muted-foreground'}`}>
                      {report.status === 'pending' ? 'Do rozpatrzenia' : report.status === 'dismissed' ? 'Odrzucone' : 'Działanie wykonane'}
                    </span>
                    <span className="text-xs text-muted-foreground">{report.review_type === 'event' ? 'Organizator' : 'Trener'} · {new Date(report.created_at).toLocaleString('pl-PL')}</span>
                  </div>
                  <p className="mt-3 flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4 text-amber-600" />{reasonLabels[report.reason] ?? report.reason}</p>
                  {report.details && <p className="mt-1 text-sm text-muted-foreground">{report.details}</p>}
                </div>
                {report.review && <span className="inline-flex items-center gap-1 font-semibold"><Star className="h-4 w-4 fill-amber-400 text-amber-400" />{report.review.rating}/5</span>}
              </div>
              {report.review ? (
                <div className="mt-4 rounded-2xl bg-secondary p-4">
                  <p className="font-semibold">{report.review.author_name}</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{report.review.comment || 'Opinia bez komentarza.'}</p>
                  <p className="mt-2 text-xs text-muted-foreground">Widoczność: {report.review.moderation_status}</p>
                </div>
              ) : <p className="mt-4 text-sm text-muted-foreground">Opinia została usunięta przez autora.</p>}
              {report.status === 'pending' && report.review && (
                <div className="mt-4 flex flex-wrap gap-2">
                  <button onClick={() => decide(report.id, 'hide')} disabled={busy === report.id} className="btn btn-secondary btn-sm"><EyeOff className="h-4 w-4" />Ukryj opinię</button>
                  <button onClick={() => decide(report.id, 'remove')} disabled={busy === report.id} className="btn btn-secondary btn-sm text-red-600"><Trash2 className="h-4 w-4" />Usuń z publikacji</button>
                  <button onClick={() => decide(report.id, 'dismiss')} disabled={busy === report.id} className="btn btn-secondary btn-sm"><CheckCircle2 className="h-4 w-4" />Odrzuć zgłoszenie</button>
                </div>
              )}
              {report.review && report.review.moderation_status !== 'published' && (
                <button onClick={() => decide(report.id, 'restore')} disabled={busy === report.id} className="btn btn-secondary btn-sm mt-4"><Eye className="h-4 w-4" />Przywróć opinię</button>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
