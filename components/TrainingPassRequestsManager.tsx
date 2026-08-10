'use client'

import { useState } from 'react'
import { Check, Loader2, Snowflake, X } from 'lucide-react'

type RequestRow = {
  id: string
  request_type: 'freeze' | 'extend'
  requested_days: number | null
  reason: string
  status: 'pending' | 'approved' | 'rejected' | 'cancelled'
  response_note: string | null
  created_at: string
  training_passes?: {
    dogs?: { name: string } | Array<{ name: string }> | null
    training_pass_products?: { name: string } | Array<{ name: string }> | null
  } | Array<{
    dogs?: { name: string } | Array<{ name: string }> | null
    training_pass_products?: { name: string } | Array<{ name: string }> | null
  }> | null
}

export default function TrainingPassRequestsManager({ initialRequests }: { initialRequests: RequestRow[] }) {
  const [requests, setRequests] = useState(initialRequests)
  const [loading, setLoading] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const pending = requests.filter(request => request.status === 'pending')
  if (pending.length === 0) return null

  async function resolve(request: RequestRow, action: 'approve' | 'reject') {
    const responseNote = window.prompt(action === 'approve' ? 'Komentarz do akceptacji (opcjonalnie)' : 'Powód odrzucenia (opcjonalnie)', '')
    if (responseNote === null) return
    setLoading(request.id); setMessage(null)
    const response = await fetch('/api/training-pass-requests', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ requestId: request.id, action, responseNote }) })
    const data = await response.json(); setLoading(null)
    if (!response.ok) { setMessage(data.error ?? 'Nie udało się rozpatrzyć wniosku'); return }
    setRequests(current => current.map(item => item.id === request.id ? { ...item, ...data } : item))
    setMessage(action === 'approve' ? 'Wniosek zaakceptowany, a zmiana zastosowana.' : 'Wniosek został odrzucony.')
    window.setTimeout(() => window.location.reload(), 700)
  }

  return <section className="card"><div className="flex items-center gap-2"><Snowflake className="h-5 w-5 text-accent" /><div><h2 className="font-heading text-xl font-semibold">Wnioski dotyczące karnetów</h2><p className="text-sm text-muted-foreground">Zamrożenie i przedłużenie wymagają Twojej decyzji.</p></div></div>{message && <p role="status" className="mt-3 rounded-xl bg-secondary px-3 py-2 text-sm">{message}</p>}<div className="mt-4 space-y-3">{pending.map(request => { const pass = first(request.training_passes); const dog = first(pass?.dogs); const product = first(pass?.training_pass_products); return <div key={request.id} className="rounded-2xl border border-border p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-semibold">{product?.name ?? 'Karnet'} · {dog?.name ?? 'Pies'}</p><p className="mt-1 text-sm">{request.request_type === 'freeze' ? 'Prośba o zamrożenie' : `Prośba o przedłużenie o ${request.requested_days} dni`}</p><p className="mt-2 text-sm text-muted-foreground">{request.reason}</p><p className="mt-1 text-xs text-muted-foreground">{new Date(request.created_at).toLocaleString('pl-PL')}</p></div><div className="flex gap-2"><button className="btn btn-secondary btn-sm text-red-700" disabled={loading === request.id} onClick={() => resolve(request, 'reject')}><X className="h-4 w-4" /> Odrzuć</button><button className="btn btn-primary btn-sm" disabled={loading === request.id} onClick={() => resolve(request, 'approve')}>{loading === request.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Akceptuj</button></div></div></div> })}</div></section>
}

function first<T>(value: T | T[] | null | undefined): T | undefined { return Array.isArray(value) ? value[0] : value ?? undefined }
