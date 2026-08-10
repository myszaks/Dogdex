'use client'

import { useEffect, useState } from 'react'
import { CalendarDays, ChevronDown, CreditCard, Loader2, Save, UsersRound } from 'lucide-react'
import type { Dog, TrainingCommercePayment, TrainingCourse, TrainingCourseEnrollment } from '@/types'

type Enrollment = TrainingCourseEnrollment & {
  training_courses?: TrainingCourse | TrainingCourse[] | null
  training_course_attendance?: Array<{ id: string; session_id: string; status: string }>
  training_commerce_payments?: TrainingCommercePayment[]
}

const statusLabels: Record<string, string> = {
  pending: 'oczekuje', confirmed: 'potwierdzony', waitlisted: 'lista rezerwowa', cancelled: 'anulowany', completed: 'zakończony',
  unpaid: 'nieopłacona', paid: 'opłacona', manual: 'opłacona poza Stripe', refunded: 'zwrócona', failed: 'nieudana', partially_refunded: 'częściowo zwrócona',
}

export default function MyTrainingCourses() {
  const [enrollments, setEnrollments] = useState<Enrollment[]>([])
  const [dogs, setDogs] = useState<Dog[]>([])
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [drafts, setDrafts] = useState<Record<string, { dogId: string; notes: string }>>({})
  const [loading, setLoading] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  async function load() {
    const [coursesResponse, dogsResponse] = await Promise.all([fetch('/api/training-courses?mine=1'), fetch('/api/dogs')])
    const [coursesData, dogsData] = await Promise.all([coursesResponse.json(), dogsResponse.json()])
    const rows = Array.isArray(coursesData?.enrollments) ? coursesData.enrollments as Enrollment[] : []
    setEnrollments(rows)
    setDogs(Array.isArray(dogsData) ? dogsData : [])
    setDrafts(Object.fromEntries(rows.map(row => [row.id, { dogId: row.dog_id ?? '', notes: row.notes ?? '' }])))
  }

  useEffect(() => {
    Promise.all([fetch('/api/training-courses?mine=1'), fetch('/api/dogs')])
      .then(async ([coursesResponse, dogsResponse]) => Promise.all([coursesResponse.json(), dogsResponse.json()]))
      .then(([coursesData, dogsData]) => {
        const rows = Array.isArray(coursesData?.enrollments) ? coursesData.enrollments as Enrollment[] : []
        setEnrollments(rows)
        setDogs(Array.isArray(dogsData) ? dogsData : [])
        setDrafts(Object.fromEntries(rows.map(row => [row.id, { dogId: row.dog_id ?? '', notes: row.notes ?? '' }])))
      }).catch(() => {})
  }, [])

  async function checkout(id: string) {
    setLoading(id); setMessage(null)
    const response = await fetch(`/api/training-course-enrollments/${id}/checkout`, { method: 'POST' })
    const data = await response.json(); setLoading(null)
    if (response.ok && data.checkoutUrl) window.location.assign(data.checkoutUrl)
    else setMessage(data.error ?? 'Nie udało się rozpocząć płatności')
  }

  async function cancel(id: string) {
    if (!window.confirm('Anulować zapis? Jeśli był opłacony, zlecimy pełny zwrot Stripe.')) return
    setLoading(id); setMessage(null)
    const response = await fetch(`/api/training-course-enrollments/${id}`, { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ reason: 'Rezygnacja uczestnika' }) })
    const data = await response.json(); setLoading(null)
    if (response.ok) await load()
    else setMessage(data.error ?? 'Nie udało się anulować zapisu')
  }

  async function save(id: string) {
    const draft = drafts[id]
    if (!draft) return
    setLoading(id); setMessage(null)
    const response = await fetch(`/api/training-course-enrollments/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(draft) })
    const data = await response.json(); setLoading(null)
    if (response.ok) { setMessage('Dane zapisu zostały zaktualizowane.'); await load() }
    else setMessage(data.error ?? 'Nie udało się zapisać zmian')
  }

  if (enrollments.length === 0) return null
  return <section className="mb-8"><h2 className="mb-4 font-heading text-xl font-semibold">Moje kursy i grupy</h2>{message && <p role="status" className="mb-3 rounded-xl bg-secondary px-4 py-3 text-sm">{message}</p>}<div className="space-y-3">{enrollments.map(enrollment => {
    const course = first(enrollment.training_courses)
    const sessions = course?.training_course_sessions?.slice().sort((a, b) => a.starts_at.localeCompare(b.starts_at)) ?? []
    const upcoming = sessions.filter(session => session.status === 'scheduled' && new Date(session.starts_at) > new Date())
    const payment = first(enrollment.training_commerce_payments)
    const refund = first(payment?.training_commerce_refunds)
    const canPay = enrollment.status === 'pending' && Boolean(enrollment.approved_at) && Number(course?.price) > 0 && ['unpaid', 'pending'].includes(enrollment.payment_status)
    const canCancel = ['pending', 'confirmed', 'waitlisted'].includes(enrollment.status)
    const canEditDog = canCancel && !['paid', 'refunded'].includes(enrollment.payment_status) && (!sessions[0] || new Date(sessions[0].starts_at) > new Date())
    const draft = drafts[enrollment.id] ?? { dogId: enrollment.dog_id ?? '', notes: enrollment.notes ?? '' }
    return <article key={enrollment.id} className="card"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-widest text-accent">{statusLabels[enrollment.status] ?? enrollment.status}</p><h3 className="font-semibold">{course?.name ?? 'Kurs grupowy'}</h3><p className="mt-1 text-sm text-muted-foreground">{enrollment.dogs?.name ?? 'Pies'}{course?.location ? ` · ${course.location}` : ''}</p></div><UsersRound className="h-5 w-5 text-accent" /></div>
      {upcoming[0] && <p className="mt-4 flex items-center gap-2 text-sm"><CalendarDays className="h-4 w-4" /> Najbliższe: {new Date(upcoming[0].starts_at).toLocaleString('pl-PL')}</p>}
      <p className="mt-2 text-xs text-muted-foreground">{upcoming.length} nadchodzących spotkań · płatność: {statusLabels[enrollment.payment_status] ?? enrollment.payment_status}</p>
      {course?.participant_message && <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm"><strong>Komunikat trenera:</strong> {course.participant_message}</p>}
      {refund && <RefundStatus status={refund.status} error={refund.error_message} amount={refund.amount} currency={payment?.currency ?? 'PLN'} />}
      <div className="mt-4 flex flex-wrap gap-2">{canPay && <button className="btn btn-primary btn-sm flex-1" disabled={loading === enrollment.id} onClick={() => checkout(enrollment.id)}>{loading === enrollment.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />} Zapłać</button>}{canCancel && <button className="btn btn-secondary btn-sm flex-1 text-red-700" disabled={loading === enrollment.id} onClick={() => cancel(enrollment.id)}>Anuluj zapis</button>}<button className="btn btn-secondary btn-sm" onClick={() => setExpanded(current => ({ ...current, [enrollment.id]: !current[enrollment.id] }))}><ChevronDown className={`h-4 w-4 transition-transform ${expanded[enrollment.id] ? 'rotate-180' : ''}`} /> Szczegóły</button></div>
      {expanded[enrollment.id] && <div className="mt-5 space-y-5 border-t border-border pt-5">
        <div><h4 className="font-semibold">Harmonogram i obecności</h4><ol className="mt-2 divide-y divide-border text-sm">{sessions.map(session => { const attendance = enrollment.training_course_attendance?.find(row => row.session_id === session.id); return <li key={session.id} className="flex justify-between gap-3 py-2"><span className={session.status === 'cancelled' ? 'line-through text-muted-foreground' : ''}>{new Date(session.starts_at).toLocaleString('pl-PL')} · {session.duration_min} min{session.cancellation_reason ? ` — ${session.cancellation_reason}` : ''}</span><span className="text-muted-foreground">{attendance ? attendanceLabel(attendance.status) : session.status === 'cancelled' ? 'odwołane' : '—'}</span></li> })}</ol></div>
        {canCancel && <div><h4 className="font-semibold">Dane zapisu</h4><div className="mt-2 grid gap-3 sm:grid-cols-2"><label htmlFor={`enrollment-dog-${enrollment.id}`}><span className="form-label">Pies</span><select id={`enrollment-dog-${enrollment.id}`} className="form-input" disabled={!canEditDog} value={draft.dogId} onChange={event => setDrafts(current => ({ ...current, [enrollment.id]: { ...draft, dogId: event.target.value } }))}>{dogs.map(dog => <option key={dog.id} value={dog.id}>{dog.name}</option>)}</select></label><label htmlFor={`enrollment-notes-${enrollment.id}`}><span className="form-label">Informacje dla trenera</span><textarea id={`enrollment-notes-${enrollment.id}`} className="form-input" rows={2} maxLength={1000} value={draft.notes} onChange={event => setDrafts(current => ({ ...current, [enrollment.id]: { ...draft, notes: event.target.value } }))} /></label></div><button className="btn btn-secondary btn-sm mt-3" disabled={loading === enrollment.id} onClick={() => save(enrollment.id)}><Save className="h-4 w-4" /> Zapisz zmiany</button>{!canEditDog && <p className="mt-2 text-xs text-muted-foreground">Po płatności lub rozpoczęciu kursu zmianę psa uzgadnia trener.</p>}</div>}
        {course?.cancellation_policy && <div><h4 className="font-semibold">Zasady rezygnacji i zwrotów</h4><p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{course.cancellation_policy}</p></div>}
        {payment && <div><h4 className="font-semibold">Płatność</h4><p className="mt-1 text-sm text-muted-foreground">{Number(payment.amount).toLocaleString('pl-PL', { style: 'currency', currency: payment.currency })} · {statusLabels[payment.status] ?? payment.status}{payment.completed_at ? ` · ${new Date(payment.completed_at).toLocaleString('pl-PL')}` : ''}</p>{payment.receipt_url && <a href={payment.receipt_url} target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm text-accent underline">Otwórz potwierdzenie Stripe</a>}</div>}
      </div>}
    </article>
  })}</div></section>
}

function first<T>(value: T | T[] | null | undefined): T | undefined { return Array.isArray(value) ? value[0] : value ?? undefined }
function attendanceLabel(status: string) { return ({ present: 'obecny', absent: 'nieobecny', excused: 'usprawiedliwiony', make_up: 'odrabianie' } as Record<string, string>)[status] ?? status }
function RefundStatus({ status, error, amount, currency }: { status: string; error?: string | null; amount: number; currency: string }) {
  const label = ({ pending: 'Zwrot jest przetwarzany przez Stripe.', requires_action: 'Zwrot wymaga działania trenera.', succeeded: 'Zwrot został wykonany.', failed: 'Zwrot nie powiódł się.', canceled: 'Zwrot został anulowany.' } as Record<string, string>)[status] ?? status
  return <p className={`mt-3 rounded-xl px-3 py-2 text-sm ${status === 'succeeded' ? 'bg-emerald-50 text-emerald-800' : status === 'failed' || status === 'requires_action' ? 'bg-red-50 text-red-700' : 'bg-secondary'}`}>{label} {Number(amount).toLocaleString('pl-PL', { style: 'currency', currency })}{error ? ` — ${error}` : ''}</p>
}
