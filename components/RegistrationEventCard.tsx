'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import EventCard from './EventCard'
import CancellationRequestForm from './CancellationRequestForm'
import { formatDate, formatDateShort, effectiveStatus } from '@/lib/utils'
import type { DogEvent, FormField, CancellationRequest } from '@/types'
import { Dog, CalendarDays, CheckCircle2, Clock, XCircle, Hourglass } from 'lucide-react'
import { cn } from '@/lib/utils'

const regStatusConfig: Record<string, { label: string; className: string; Icon: React.ElementType }> = {
  pending:              { label: 'Oczekuje',              className: 'bg-amber-100 text-amber-700',   Icon: Clock },
  confirmed:            { label: 'Potwierdzone',          className: 'bg-emerald-100 text-emerald-700', Icon: CheckCircle2 },
  cancelled:            { label: 'Anulowane',             className: 'bg-red-100 text-red-700',       Icon: XCircle },
  cancellation_pending: { label: 'Oczekuje na anulację',  className: 'bg-orange-100 text-orange-700',  Icon: Hourglass },
}

function formatFieldValue(field: FormField, val: unknown): string {
  if (typeof val === 'boolean') return val ? 'Tak' : 'Nie'
  if (field.type === 'checkbox' && typeof val === 'string') {
    const normalized = val.trim().toLowerCase()
    if (normalized === 'true') return 'Tak'
    if (normalized === 'false') return 'Nie'
  }
  if (Array.isArray(val)) {
    if (field.type === 'multidate') {
      return val.map(d => { try { return formatDateShort(d as string) } catch { return String(d) } }).join(', ')
    }
    return val.map(v => formatFieldValue(field, v)).join(', ')
  }
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
  pendingCancellationRequest?: CancellationRequest | null
}

export default function RegistrationEventCard({ event, registration, participant, pendingCancellationRequest }: Props) {
  const router = useRouter()
  const [status, setStatus] = useState(registration.status)
  const [hasPendingRequest, setHasPendingRequest] = useState(!!pendingCancellationRequest)

  // multidate cancel UI state
  const [cancelOpen, setCancelOpen] = useState(false)
  const formFields: FormField[] = Array.isArray(event.form_fields) ? event.form_fields : []
  const formData = registration.form_data ?? {}
  const filledFields = formFields.filter(
    f => formData[f.id] !== undefined && formData[f.id] !== null && formData[f.id] !== ''
  )

  const dispStatus = effectiveStatus(event)
  const detailHref = dispStatus === 'finished' || dispStatus === 'cancelled'
    ? `/archive/${event.slug}`
    : `/events/${event.slug}`

  const canCancel =
    status !== 'cancelled' &&
    !hasPendingRequest &&
    dispStatus !== 'finished' &&
    dispStatus !== 'cancelled'

  const displayStatusKey = hasPendingRequest ? 'cancellation_pending' : status
  const config = regStatusConfig[displayStatusKey] ?? { label: displayStatusKey, className: 'bg-secondary text-foreground', Icon: Clock }
  const StatusIcon = config.Icon

  return (
    <EventCard
      event={event}
      hidePublicActions
      extraActions={
        <>
          {/* Registration status + dog info */}
          <div className="w-full bg-secondary rounded-2xl px-4 py-3 space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <Dog className="w-4 h-4 text-muted-foreground shrink-0" />
                <p className="text-sm font-semibold text-foreground truncate">
                  {participant?.dog_name ?? '—'}
                  {participant?.dog_breed && (
                    <span className="text-muted-foreground font-normal"> ({participant.dog_breed})</span>
                  )}
                </p>
              </div>
              <span className={cn('inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold shrink-0', config.className)}>
                <StatusIcon className="w-3 h-3" />
                {config.label}
              </span>
            </div>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <CalendarDays className="w-3.5 h-3.5" />
              Zapisano: {formatDate(registration.created_at)}
            </p>
          </div>

          {/* Pending cancellation request notice */}
          {hasPendingRequest && (
            <div className="w-full bg-orange-50 border border-orange-200 rounded-2xl px-4 py-3">
              <div className="flex items-start gap-2">
                <Hourglass className="w-4 h-4 text-orange-500 shrink-0 mt-0.5" />
                <p className="text-sm text-orange-700">
                  Wniosek o rezygnację został wysłany i oczekuje na akceptację organizatora.
                </p>
              </div>
            </div>
          )}

          {/* Extra form fields */}
          {filledFields.length > 0 && (
            <div className="w-full bg-secondary rounded-2xl px-4 py-3 space-y-1">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Dane formularza</p>
              {filledFields.map(f => (
                <div key={f.id} className="flex gap-2 text-xs">
                  <span className="text-muted-foreground shrink-0">{f.label}:</span>
                  <span className="text-foreground font-medium">{formatFieldValue(f, formData[f.id])}</span>
                </div>
              ))}
            </div>
          )}

          <div className="flex w-full gap-2">
            <Link href={detailHref} className="btn btn-secondary btn-sm flex-1">
              Szczegóły
            </Link>
            {canCancel && (
              <button
                onClick={() => setCancelOpen(true)}
                className="btn btn-sm border border-red-300 text-red-600 hover:bg-red-50"
              >
                Rezygnuj
              </button>
            )}
          </div>

          {/* Cancellation panel */}
          {cancelOpen && (
            <div className="w-full bg-red-50 border border-red-200 rounded-2xl px-4 py-4 space-y-4">
              <CancellationRequestForm
                registrationId={registration.id}
                formFields={formFields}
                formData={registration.form_data}
                onSuccess={() => {
                  setHasPendingRequest(true)
                  setCancelOpen(false)
                  router.refresh()
                }}
                onCancel={() => setCancelOpen(false)}
              />
            </div>
          )}
        </>
      }
    />
  )
}
