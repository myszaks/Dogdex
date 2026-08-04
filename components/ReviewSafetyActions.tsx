'use client'

import { useState } from 'react'
import { BadgeCheck, Flag, MessageSquare, Trash2 } from 'lucide-react'
import useUser from '@/hooks/useUser'
import type { ReviewType } from '@/lib/reviewSafety'

interface Props {
  reviewId: string
  reviewType: ReviewType
  ownerId: string
  authorUserId?: string
  isVerified?: boolean
  initialResponse?: string | null
  initialResponseAt?: string | null
}

const reasons = [
  ['spam', 'Spam lub reklama'],
  ['offensive', 'Treść obraźliwa'],
  ['privacy', 'Naruszenie prywatności'],
  ['conflict', 'Konflikt interesów'],
  ['other', 'Inny powód'],
] as const

export default function ReviewSafetyActions({
  reviewId,
  reviewType,
  ownerId,
  authorUserId,
  isVerified = true,
  initialResponse,
  initialResponseAt,
}: Props) {
  const { user } = useUser()
  const [response, setResponse] = useState(initialResponse ?? '')
  const [responseAt, setResponseAt] = useState(initialResponseAt ?? null)
  const [replyOpen, setReplyOpen] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  const [draft, setDraft] = useState(initialResponse ?? '')
  const [reason, setReason] = useState('offensive')
  const [details, setDetails] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const canRespond = Boolean(user && user.id === ownerId)
  const canReport = Boolean(user && user.id !== ownerId && user.id !== authorUserId)

  async function saveResponse() {
    setBusy(true)
    setMessage(null)
    const res = await fetch(`/api/reviews/${reviewType}/${reviewId}/response`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ response: draft }),
    })
    const data = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) return setMessage(data.error ?? 'Nie udało się zapisać odpowiedzi')
    setResponse(data.response_text)
    setResponseAt(data.response_at)
    setReplyOpen(false)
  }

  async function deleteResponse() {
    setBusy(true)
    const res = await fetch(`/api/reviews/${reviewType}/${reviewId}/response`, { method: 'DELETE' })
    setBusy(false)
    if (!res.ok) return setMessage('Nie udało się usunąć odpowiedzi')
    setResponse('')
    setResponseAt(null)
    setDraft('')
    setReplyOpen(false)
  }

  async function submitReport() {
    setBusy(true)
    setMessage(null)
    const res = await fetch('/api/review-reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ review_type: reviewType, review_id: reviewId, reason, details }),
    })
    const data = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) return setMessage(data.error ?? 'Nie udało się wysłać zgłoszenia')
    setReportOpen(false)
    setMessage('Dziękujemy. Zgłoszenie trafiło do moderacji.')
  }

  return (
    <div className="mt-4 space-y-3 border-t border-border pt-3">
      <div className="flex flex-wrap items-center gap-3 text-xs">
        {isVerified && (
          <span className="inline-flex items-center gap-1 font-semibold text-emerald-700">
            <BadgeCheck className="h-4 w-4" /> Potwierdzony udział
          </span>
        )}
        {canRespond && (
          <button type="button" onClick={() => setReplyOpen(value => !value)} className="inline-flex items-center gap-1 text-accent hover:underline">
            <MessageSquare className="h-3.5 w-3.5" /> {response ? 'Edytuj odpowiedź' : 'Odpowiedz'}
          </button>
        )}
        {canReport && !reportOpen && (
          <button type="button" onClick={() => setReportOpen(true)} className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground">
            <Flag className="h-3.5 w-3.5" /> Zgłoś opinię
          </button>
        )}
      </div>

      {response && (
        <div className="rounded-2xl bg-secondary px-4 py-3 text-sm">
          <p className="font-semibold text-foreground">Odpowiedź {reviewType === 'event' ? 'organizatora' : 'trenera'}</p>
          <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{response}</p>
          {responseAt && <p className="mt-2 text-xs text-muted-foreground">{new Date(responseAt).toLocaleDateString('pl-PL')}</p>}
        </div>
      )}

      {replyOpen && (
        <div className="space-y-2 rounded-2xl border border-border p-3">
          <textarea value={draft} onChange={event => setDraft(event.target.value)} maxLength={2000} rows={3} className="input w-full" placeholder="Napisz rzeczową odpowiedź…" />
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={saveResponse} disabled={busy || !draft.trim()} className="btn btn-primary btn-sm">Zapisz odpowiedź</button>
            {response && <button type="button" onClick={deleteResponse} disabled={busy} className="btn btn-secondary btn-sm text-red-600"><Trash2 className="h-4 w-4" /> Usuń</button>}
            <button type="button" onClick={() => setReplyOpen(false)} className="btn btn-secondary btn-sm">Anuluj</button>
          </div>
        </div>
      )}

      {reportOpen && (
        <div className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50 p-3">
          <p className="text-sm font-semibold text-amber-900">Dlaczego zgłaszasz tę opinię?</p>
          <select value={reason} onChange={event => setReason(event.target.value)} className="input w-full">
            {reasons.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <textarea value={details} onChange={event => setDetails(event.target.value)} maxLength={1000} rows={2} className="input w-full" placeholder="Dodatkowe informacje (opcjonalnie)" />
          <div className="flex gap-2">
            <button type="button" onClick={submitReport} disabled={busy} className="btn btn-primary btn-sm">Wyślij zgłoszenie</button>
            <button type="button" onClick={() => setReportOpen(false)} className="btn btn-secondary btn-sm">Anuluj</button>
          </div>
        </div>
      )}
      {message && <p className="text-xs text-muted-foreground" role="status">{message}</p>}
    </div>
  )
}
