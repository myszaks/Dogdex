'use client'
import { useEffect, useState } from 'react'
import useUser from '@/hooks/useUser'
import type { FormField } from '@/types'
import ConfirmModal from './ConfirmModal'

interface Props {
  eventId: string
  eventTitle: string
  formFields: FormField[]
}

export default function UserRegistrationStatus({ eventId, eventTitle, formFields }: Props) {
  const { user } = useUser()
  // undefined = loading, null = not found
  const [reg, setReg] = useState<Record<string, unknown> | null | undefined>(undefined)
  const [cancelling, setCancelling] = useState(false)
  const [cancelled, setCancelled] = useState(false)
  const [cancelError, setCancelError] = useState<string | null>(null)
  const [requestSent, setRequestSent] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  useEffect(() => {
    if (!user?.email) {
      setReg(null)
      return
    }
    fetch(`/api/registrations/my?eventId=${eventId}`)
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        setReg(data)
        setRequestSent(Boolean(data?.pending_cancellation_request))
      })
      .catch(() => setReg(null))
  }, [user?.email, eventId])

  if (reg === undefined || !user || !reg) return null

  if (cancelled) {
    return (
      <div className="border border-slate-200 rounded-xl p-4 bg-slate-50 text-center">
        <p className="text-sm text-slate-500 font-medium">Zapis anulowany</p>
      </div>
    )
  }

  const statusStyles: Record<string, string> = {
    confirmed: 'bg-green-50 border-green-200',
    pending: 'bg-yellow-50 border-yellow-200',
    cancelled: 'bg-slate-50 border-slate-200',
  }
  const statusText: Record<string, string> = {
    confirmed: 'Jesteś zapisany/-a',
    pending: 'Zapis oczekuje na potwierdzenie',
    cancelled: 'Zapis anulowany',
  }

  const status = reg.status as string
  const p = reg.participants as Record<string, string> | undefined

  async function handleCancel() {
    setCancelling(true)
    setCancelError(null)
    try {
      const res = await fetch(`/api/registrations/${reg!.id}/cancel-request`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setCancelError(json.error ?? 'Nie udało się wysłać wniosku o rezygnację')
      } else {
        setRequestSent(true)
      }
    } catch {
      setCancelError('Nie udało się wysłać wniosku o rezygnację')
    }
    setCancelling(false)
  }

  return (
    <div className={`border rounded-xl p-4 space-y-3 ${statusStyles[status] ?? 'bg-slate-50 border-slate-200'}`}>
      <p className="font-semibold text-sm text-slate-800">{statusText[status] ?? status}</p>
      {p && (
        <p className="text-xs text-slate-600">
          {p.dog_name}
          {p.dog_breed ? ` (${p.dog_breed})` : ''}
          <span className="text-slate-400 ml-2">· {p.owner_name}</span>
        </p>
      )}
      {requestSent && (
        <p className="text-xs text-orange-700 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2">
          Wniosek o rezygnację został wysłany i oczekuje na akceptację organizatora.
        </p>
      )}
      {cancelError && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {cancelError}
        </p>
      )}
      {status !== 'cancelled' && !requestSent && (
        <button
          onClick={() => setConfirmOpen(true)}
          disabled={cancelling}
          className="w-full text-sm text-red-600 border border-red-200 bg-white hover:bg-red-50 rounded-lg py-1.5 transition-colors disabled:opacity-50"
        >
          {cancelling ? 'Wysyłanie...' : 'Zrezygnuj z udziału'}
        </button>
      )}
      <ConfirmModal
        open={confirmOpen}
        title="Zrezygnować z udziału?"
        message="Czy na pewno chcesz wycofać swój zapis na to wydarzenie?"
        confirmLabel="Wyślij wniosek"
        danger
        onConfirm={() => { setConfirmOpen(false); handleCancel() }}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  )
}
