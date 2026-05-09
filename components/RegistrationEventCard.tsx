'use client'
import Link from 'next/link'
import EventCard from './EventCard'
import { formatDate, formatDateShort } from '@/lib/utils'
import type { DogEvent, FormField } from '@/types'

const regStatusLabel: Record<string, string> = {
  pending: 'Oczekuje',
  confirmed: 'Potwierdzone',
  cancelled: 'Anulowane',
}
const regStatusColor: Record<string, string> = {
  pending: 'badge-yellow',
  confirmed: 'badge-green',
  cancelled: 'badge-red',
}

function formatFieldValue(field: FormField, val: unknown): string {
  if (Array.isArray(val)) {
    if (field.type === 'multidate') {
      return val.map(d => { try { return formatDateShort(d as string) } catch { return String(d) } }).join(', ')
    }
    return val.join(', ')
  }
  if (field.type === 'checkbox') return val ? 'Tak' : 'Nie'
  return String(val)
}

interface Props {
  event: DogEvent
  registration: {
    id: string
    status: string
    created_at: string
    form_data?: Record<string, unknown> | null
  }
  participant: {
    dog_name?: string | null
    dog_breed?: string | null
    owner_name?: string | null
  } | null
}

export default function RegistrationEventCard({ event, registration, participant }: Props) {
  const statusKey = registration.status
  const formFields: FormField[] = Array.isArray(event.form_fields) ? event.form_fields : []
  const formData = registration.form_data ?? {}

  const filledFields = formFields.filter(
    f => formData[f.id] !== undefined && formData[f.id] !== null && formData[f.id] !== ''
  )

  return (
    <EventCard
      event={event}
      hidePublicActions
      extraActions={
        <>
          {/* Registration status badge + dog info */}
          <div className="w-full flex items-center justify-between gap-2 py-2 px-3 bg-slate-50 rounded-lg text-sm">
            <div className="min-w-0">
              <p className="text-slate-700 font-medium truncate">
                🐕 {participant?.dog_name ?? '—'}
                {participant?.dog_breed ? <span className="text-slate-400 font-normal"> ({participant.dog_breed})</span> : null}
              </p>
              <p className="text-xs text-slate-400">Zapisano: {formatDate(registration.created_at)}</p>
            </div>
            <span className={`badge shrink-0 ${regStatusColor[statusKey] ?? 'badge-blue'}`}>
              {regStatusLabel[statusKey] ?? statusKey}
            </span>
          </div>

          {/* Extra form fields */}
          {filledFields.length > 0 && (
            <div className="w-full px-3 py-2 bg-slate-50 rounded-lg space-y-1">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Dane formularza</p>
              {filledFields.map(f => (
                <div key={f.id} className="flex gap-2 text-xs">
                  <span className="text-slate-400 shrink-0">{f.label}:</span>
                  <span className="text-slate-700 font-medium">{formatFieldValue(f, formData[f.id])}</span>
                </div>
              ))}
            </div>
          )}

          <Link
            href={event.status === 'finished' || event.status === 'cancelled' ? `/archive/${event.slug ?? event.id}` : `/events/${event.slug ?? event.id}`}
            className="btn btn-secondary btn-sm"
          >
            Szczegóły
          </Link>
        </>
      }
    />
  )
}
