'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import EventCard from './EventCard'
import { formatDate, formatDateShort, effectiveStatus } from '@/lib/utils'
import type { DogEvent, FormField, CancellationRequest } from '@/types'
import { Dog, CalendarDays, CheckCircle2, Clock, XCircle, AlertTriangle, Hourglass } from 'lucide-react'
import { cn } from '@/lib/utils'
import GoogleCalendarPopupLink from './GoogleCalendarPopupLink'
import EventCheckInCode from './EventCheckInCode'

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
    checkin_token?: string | null
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
  const [hasPendingRequest, setHasPendingRequest] = useState(!!pendingCancellationRequest)

  // multidate cancel UI state
  const [cancelOpen, setCancelOpen] = useState(false)
  const [selectedDates, setSelectedDates] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const formFields: FormField[] = Array.isArray(event.form_fields) ? event.form_fields : []
  const formData = registration.form_data ?? {}
  const filledFields = formFields.filter(
    f => formData[f.id] !== undefined && formData[f.id] !== null && formData[f.id] !== ''
  )

  // Collect all multidate fields + their selected dates
  const multidateFields = formFields.filter(f => f.type === 'multidate')
  const allSelectedDates: string[] = multidateFields.flatMap(f => {
    const val = formData[f.id]
    return Array.isArray(val) ? (val as string[]) : []
  })
  const hasMultidate = allSelectedDates.length > 0

  const dispStatus = effectiveStatus(event)
  const detailHref = dispStatus === 'finished' || dispStatus === 'cancelled'
    ? `/archive/${event.slug}`
    : `/events/${event.slug}`

  const canCancel =
    registration.status !== 'cancelled' &&
    !hasPendingRequest &&
    dispStatus !== 'finished' &&
    dispStatus !== 'cancelled'

  const displayStatusKey = hasPendingRequest ? 'cancellation_pending' : registration.status
  const config = regStatusConfig[displayStatusKey] ?? { label: displayStatusKey, className: 'bg-secondary text-foreground', Icon: Clock }
  const StatusIcon = config.Icon

  function toggleDate(date: string) {
    setSelectedDates(prev =>
      prev.includes(date) ? prev.filter(d => d !== date) : [...prev, date]
    )
  }

  async function handleSubmitCancel() {
    setSubmitting(true)
    setError(null)
    try {
      const body = hasMultidate && selectedDates.length > 0
        ? { cancelled_dates: selectedDates }
        : {}

      const res = await fetch(`/api/registrations/${registration.id}/cancel-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(json.error ?? 'Błąd wysyłki wniosku')
        return
      }
      setHasPendingRequest(true)
      setCancelOpen(false)
      router.refresh()
    } finally {
      setSubmitting(false)
    }
  }

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

          <div className="flex w-full flex-wrap gap-2">
            <Link href={detailHref} className="btn btn-secondary btn-sm flex-1">
              Szczegóły
            </Link>
            {registration.status !== 'cancelled' && (
              <GoogleCalendarPopupLink
                href={`/api/calendar/google/registrations/${registration.id}`}
                label="Google Calendar"
                className="btn btn-secondary btn-sm"
              />
            )}
            {registration.status === 'confirmed' && registration.checkin_token && dispStatus === 'upcoming' && (
              <EventCheckInCode token={registration.checkin_token} dogName={participant?.dog_name ?? 'pies'} />
            )}
            {canCancel && (
              <button
                onClick={() => { setCancelOpen(true); setSelectedDates([]); setError(null) }}
                className="btn btn-sm border border-red-300 text-red-600 hover:bg-red-50"
              >
                Rezygnuj
              </button>
            )}
          </div>

          {/* Cancellation panel */}
          {cancelOpen && (
            <div className="w-full bg-red-50 border border-red-200 rounded-2xl px-4 py-4 space-y-4">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                <p className="text-sm text-red-700 font-medium">
                  {hasMultidate
                    ? 'Wybierz terminy, z których chcesz zrezygnować:'
                    : 'Na pewno chcesz zrezygnować z tego wydarzenia?'}
                </p>
              </div>

              {/* Multidate selector */}
              {hasMultidate && (
                <div className="space-y-2">
                  {allSelectedDates.map((date, index) => (
                    <label key={date} htmlFor={`cancel-date-${registration.id}-${index}`} className="flex items-center gap-3 cursor-pointer">
                      <input
                        id={`cancel-date-${registration.id}-${index}`}
                        type="checkbox"
                        className="w-4 h-4 accent-red-500"
                        checked={selectedDates.includes(date)}
                        onChange={() => toggleDate(date)}
                      />
                      <span className="text-sm text-slate-700">{formatDateShort(date)}</span>
                    </label>
                  ))}
                  <p className="text-xs text-slate-500 pt-1">
                    Rezygnacja z wszystkich terminów spowoduje anulowanie całego zgłoszenia.
                  </p>
                </div>
              )}

              {error && (
                <p className="text-xs text-red-600 bg-red-100 rounded-lg px-3 py-2">{error}</p>
              )}

              <div className="flex gap-2">
                <button
                  onClick={handleSubmitCancel}
                  disabled={submitting || (hasMultidate && selectedDates.length === 0)}
                  className="btn btn-sm bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {submitting ? 'Wysyłam…' : 'Wyślij wniosek o rezygnację'}
                </button>
                <button
                  onClick={() => { setCancelOpen(false); setError(null) }}
                  disabled={submitting}
                  className="btn btn-secondary btn-sm"
                >
                  Anuluj
                </button>
              </div>
            </div>
          )}
        </>
      }
    />
  )
}
