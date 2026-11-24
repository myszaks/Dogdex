'use client'
import { useCallback, useEffect, useState } from 'react'
import useUser from '@/hooks/useUser'
import type { FormField } from '@/types'
import Modal from './Modal'
import CancellationRequestForm from './CancellationRequestForm'

interface Props {
  eventId: string
  eventTitle: string
  formFields: FormField[]
}

type RegistrationWithParticipant = Record<string, unknown> & {
  id: string
  status: string
  participants?: Record<string, string | null>
  form_data?: Record<string, unknown> | null
  pending_cancellation_request?: unknown
}

export default function UserRegistrationStatus({ eventId, eventTitle, formFields }: Props) {
  const { user } = useUser()
  // undefined = loading, [] = not found
  const [registrations, setRegistrations] = useState<RegistrationWithParticipant[] | undefined>(undefined)
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

  const selectedRegistration = registrations.find(reg => reg.id === confirmRegistrationId)

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
            {status !== 'cancelled' && !requestSent && (
              <button
                onClick={() => setConfirmRegistrationId(reg.id)}
                className="w-full text-sm text-red-600 border border-red-200 bg-white hover:bg-red-50 rounded-lg py-1.5 transition-colors disabled:opacity-50"
              >
                Zrezygnuj z udziału
              </button>
            )}
          </div>
        )
      })}

      {selectedRegistration && (
        <Modal open title="Rezygnacja z udziału" onClose={() => setConfirmRegistrationId(null)}>
          <p className="text-sm font-semibold mb-4">
            {eventTitle}{selectedRegistration.participants?.dog_name ? ` · ${selectedRegistration.participants.dog_name}` : ''}
          </p>
          <CancellationRequestForm
            key={selectedRegistration.id}
            registrationId={selectedRegistration.id}
            formFields={formFields}
            formData={selectedRegistration.form_data}
            onSuccess={() => {
              setRequestSentIds(previous => new Set(previous).add(selectedRegistration.id))
              setConfirmRegistrationId(null)
            }}
            onCancel={() => setConfirmRegistrationId(null)}
          />
        </Modal>
      )}
    </div>
  )
}
