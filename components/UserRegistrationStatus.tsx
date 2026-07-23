'use client'
import { useCallback, useEffect, useState } from 'react'
import useUser from '@/hooks/useUser'
import type { FormField } from '@/types'
import ConfirmModal from './ConfirmModal'

interface Props {
  eventId: string
  eventTitle: string
  formFields: FormField[]
}

type RegistrationWithParticipant = Record<string, unknown> & {
  id: string
  status: string
  participants?: Record<string, string | null>
  pending_cancellation_request?: unknown
}

export default function UserRegistrationStatus({ eventId }: Props) {
  const { user } = useUser()
  // undefined = loading, [] = not found
  const [registrations, setRegistrations] = useState<RegistrationWithParticipant[] | undefined>(undefined)
  const [cancellingId, setCancellingId] = useState<string | null>(null)
  const [cancelErrors, setCancelErrors] = useState<Record<string, string>>({})
  const [requestSentIds, setRequestSentIds] = useState<Set<string>>(() => new Set())
  const [confirmRegistrationId, setConfirmRegistrationId] = useState<string | null>(null)

  const loadRegistrations = useCallback(() => {
    if (!user?.email) return

    fetch(`/api/registrations/my?eventId=${eventId}`, { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : []))
      .then(data => {
        const nextRegistrations: RegistrationWithParticipant[] = Array.isArray(data)
          ? data
          : data
          ? [data]
          : []

        setRegistrations(nextRegistrations)
        setRequestSentIds(new Set(
          nextRegistrations
            .filter(reg => Boolean(reg.pending_cancellation_request))
            .map(reg => reg.id)
        ))
      })
      .catch(() => {
        setRegistrations([])
        setRequestSentIds(new Set())
      })
  }, [user?.email, eventId])

  useEffect(() => {
    if (!user?.email) {
      setRegistrations([])
      setRequestSentIds(new Set())
      return
    }

    loadRegistrations()

    const refreshIfVisible = () => {
      if (document.visibilityState === 'visible') loadRegistrations()
    }
    window.addEventListener('focus', refreshIfVisible)
    document.addEventListener('visibilitychange', refreshIfVisible)
    const intervalId = window.setInterval(refreshIfVisible, 30_000)

    return () => {
      window.removeEventListener('focus', refreshIfVisible)
      document.removeEventListener('visibilitychange', refreshIfVisible)
      window.clearInterval(intervalId)
    }
  }, [user?.email, loadRegistrations])

  if (registrations === undefined || !user || registrations.length === 0) return null

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

  async function handleCancel(registrationId: string) {
    setCancellingId(registrationId)
    setCancelErrors(prev => ({ ...prev, [registrationId]: '' }))
    try {
      const res = await fetch(`/api/registrations/${registrationId}/cancel-request`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setCancelErrors(prev => ({
          ...prev,
          [registrationId]: json.error ?? 'Nie udało się wysłać wniosku o rezygnację',
        }))
      } else {
        setRequestSentIds(prev => new Set(prev).add(registrationId))
      }
    } catch {
      setCancelErrors(prev => ({
        ...prev,
        [registrationId]: 'Nie udało się wysłać wniosku o rezygnację',
      }))
    }
    setCancellingId(null)
  }

  return (
    <div className="space-y-3">
      {registrations.length > 1 && (
        <p className="text-xs font-medium text-slate-500">
          Twoje zapisy na to wydarzenie: {registrations.length}
        </p>
      )}

      {registrations.map(reg => {
        const status = reg.status
        const p = reg.participants
        const requestSent = requestSentIds.has(reg.id)
        const cancelError = cancelErrors[reg.id]

        return (
          <div key={reg.id} className={`border rounded-xl p-4 space-y-3 ${statusStyles[status] ?? 'bg-slate-50 border-slate-200'}`}>
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
                onClick={() => setConfirmRegistrationId(reg.id)}
                disabled={cancellingId === reg.id}
                className="w-full text-sm text-red-600 border border-red-200 bg-white hover:bg-red-50 rounded-lg py-1.5 transition-colors disabled:opacity-50"
              >
                {cancellingId === reg.id ? 'Wysyłanie...' : 'Zrezygnuj z udziału'}
              </button>
            )}
          </div>
        )
      })}

      <ConfirmModal
        open={confirmRegistrationId !== null}
        title="Zrezygnować z udziału?"
        message="Czy na pewno chcesz wycofać ten zapis na wydarzenie?"
        confirmLabel="Wyślij wniosek"
        danger
        onConfirm={() => {
          const registrationId = confirmRegistrationId
          setConfirmRegistrationId(null)
          if (registrationId) handleCancel(registrationId)
        }}
        onCancel={() => setConfirmRegistrationId(null)}
      />
    </div>
  )
}
