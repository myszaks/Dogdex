'use client'
import { useState } from 'react'
import { formatDateShort } from '@/lib/utils'
import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react'
import type { CancellationRequest, Registration } from '@/types'

interface ParticipantInfo {
  dog_name: string | null
  owner_name: string | null
  owner_email: string | null
}

export interface CancellationRequestRow extends CancellationRequest {
  participant?: ParticipantInfo | null
}

export interface CancellationResolution {
  requestId: string
  action: 'accept' | 'reject'
  registration: (Partial<Registration> & Pick<Registration, 'id'>) | null
}

interface Props {
  requests: CancellationRequestRow[]
  onResolved: (resolution: CancellationResolution) => void
}

export default function CancellationRequestsPanel({ requests, onResolved }: Props) {
  const [processing, setProcessing] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [messages, setMessages] = useState<Record<string, string>>({})

  const pending = requests.filter(r => r.status === 'pending')
  if (pending.length === 0) return null

  async function handle(id: string, action: 'accept' | 'reject') {
    setProcessing(id)
    setErrors(prev => { const n = { ...prev }; delete n[id]; return n })
    try {
      const res = await fetch(`/api/cancellation-requests/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setErrors(prev => ({ ...prev, [id]: json.error ?? 'Błąd' }))
        return
      }
      if (json.action === 'refund_pending') {
        setMessages(prev => ({ ...prev, [id]: 'Zwrot został zlecony. Wniosek zostanie zaakceptowany automatycznie po potwierdzeniu Stripe.' }))
        return
      }
      onResolved({
        requestId: id,
        action,
        registration: json.registration ?? null,
      })
    } finally {
      setProcessing(null)
    }
  }

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        <AlertTriangle className="w-4 h-4 text-orange-500" />
        <h2 className="font-semibold text-slate-700">
          Wnioski o rezygnację ({pending.length})
        </h2>
      </div>
      <div className="space-y-3">
        {pending.map(req => {
          const p = req.participant
          const isProcessing = processing === req.id
          return (
            <div
              key={req.id}
              className="bg-orange-50 border border-orange-200 rounded-2xl px-4 py-4 space-y-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-slate-800">
                    🐕 {p?.dog_name ?? '—'}
                    {p?.owner_name && (
                      <span className="text-slate-500 font-normal text-sm ml-2">({p.owner_name})</span>
                    )}
                  </p>
                  {p?.owner_email && (
                    <p className="text-xs text-slate-400">{p.owner_email}</p>
                  )}
                </div>
                <span className="text-xs text-orange-600 bg-orange-100 rounded-full px-2 py-0.5 shrink-0">
                  Oczekuje
                </span>
              </div>

              {req.cancelled_dates ? (
                <div>
                  <p className="text-xs text-slate-500 mb-1">Terminy do anulowania:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {req.cancelled_dates.map(d => (
                      <span key={d} className="text-xs bg-white border border-orange-200 rounded-full px-2.5 py-0.5 text-slate-700">
                        {formatDateShort(d)}
                      </span>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-red-600">Wniosek o anulowanie całego zgłoszenia</p>
              )}

              {errors[req.id] && (
                <p className="text-xs text-red-600">{errors[req.id]}</p>
              )}
              {messages[req.id] && <p className="text-xs text-sky-700">{messages[req.id]}</p>}

              <div className="flex gap-2">
                <button
                  onClick={() => handle(req.id, 'accept')}
                  disabled={isProcessing}
                  className="btn btn-sm bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-1.5"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {isProcessing ? 'Przetwarzam…' : 'Zaakceptuj'}
                </button>
                <button
                  onClick={() => handle(req.id, 'reject')}
                  disabled={isProcessing}
                  className="btn btn-sm border border-red-300 text-red-600 hover:bg-red-50 disabled:opacity-50 flex items-center gap-1.5"
                >
                  <XCircle className="w-3.5 h-3.5" />
                  {isProcessing ? '…' : 'Odrzuć'}
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
