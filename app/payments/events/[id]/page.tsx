import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { requireRole } from '@/lib/getServerUser'
import { createAuthClient } from '@/lib/supabaseServer'
import RefundRetryButton from '@/components/RefundRetryButton'

interface Props { params: Promise<{ id: string }> }
interface PaymentItemRow { id: string; amount: number; refunded_amount: number; event_registration_items: { label: string; occurrence_date: string | null } | Array<{ label: string; occurrence_date: string | null }> | null }
interface RefundAttemptRow { attempt_number: number; stripe_refund_id: string | null; status: string; error_message: string | null; created_at: string }
interface RefundRow { id: string; amount: number; currency: string; status: string; requested_dates: unknown; error_message: string | null; created_at: string; event_refund_attempts: RefundAttemptRow[] | null }
const refundLabels: Record<string, string> = { pending: 'Oczekuje', requires_action: 'Wymaga działania', succeeded: 'Zrealizowany', failed: 'Nieudany', canceled: 'Anulowany' }

export default async function EventPaymentDetailsPage({ params }: Props) {
  const { id } = await params
  const { user, role } = await requireRole(['organizer', 'trainer', 'admin'])
  const db = await createAuthClient()
  const { data: payment } = await db.from('event_payments').select(`
    *, registrations(form_data, participants(owner_name, owner_email, dog_name), events(title)),
    event_payment_items(id, amount, refunded_amount, event_registration_items(label, occurrence_date)),
    event_refunds(id, amount, currency, status, requested_dates, error_message, created_at,
      event_refund_attempts(attempt_number, stripe_refund_id, status, error_message, created_at))
  `).eq('id', id).maybeSingle()
  if (!payment || (role !== 'admin' && payment.payee_user_id !== user.id)) notFound()
  const registration = Array.isArray(payment.registrations) ? payment.registrations[0] : payment.registrations
  const participant = Array.isArray(registration?.participants) ? registration.participants[0] : registration?.participants
  const event = Array.isArray(registration?.events) ? registration.events[0] : registration?.events
  const paymentItems = (payment.event_payment_items ?? []) as PaymentItemRow[]
  const refunds = (payment.event_refunds ?? []) as RefundRow[]
  const money = (amount: number) => Number(amount).toLocaleString('pl-PL', { style: 'currency', currency: payment.currency })

  return <div className="mx-auto max-w-5xl px-4 py-8">
    <Link href="/payments" className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary"><ArrowLeft className="h-4 w-4" /> Wróć do płatności</Link>
    <div className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="page-title">{event?.title ?? 'Płatność wydarzenia'}</h1><p className="mt-2 text-muted-foreground">{participant?.owner_name} · {participant?.dog_name} · {participant?.owner_email}</p></div><div className="text-right"><p className="text-2xl font-bold">{money(payment.amount)}</p><p className="text-sm text-muted-foreground">po zwrotach: {money(Number(payment.amount) - Number(payment.refunded_amount ?? 0))}</p></div></div>

    {payment.reconciliation_status === 'attention' || payment.reconciliation_status === 'error' ? <div className="mt-6 flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900"><AlertTriangle className="h-5 w-5 shrink-0" /><div><p className="font-semibold">Transakcja wymaga uwagi</p><p className="text-sm">{payment.reconciliation_error}</p></div></div> : <div className="mt-6 flex gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800"><CheckCircle2 className="h-5 w-5" /> Status zgodny z Stripe</div>}

    <section className="mt-6 rounded-3xl border border-border bg-white p-6"><h2 className="text-lg font-semibold">Pozycje transakcji</h2><div className="mt-4 divide-y divide-border">{paymentItems.map(item => { const detail = Array.isArray(item.event_registration_items) ? item.event_registration_items[0] : item.event_registration_items; return <div key={item.id} className="flex items-center justify-between gap-4 py-3"><div><p className="font-medium">{detail?.label}</p>{detail?.occurrence_date && <p className="text-xs text-muted-foreground">Termin: {detail.occurrence_date}</p>}</div><div className="text-right"><p>{money(item.amount)}</p>{Number(item.refunded_amount) > 0 && <p className="text-xs text-red-600">zwrócono {money(item.refunded_amount)}</p>}</div></div> })}</div></section>

    <section className="mt-6 rounded-3xl border border-border bg-white p-6"><h2 className="text-lg font-semibold">Zwroty i próby</h2><div className="mt-4 space-y-4">{refunds.map(refund => <div key={refund.id} className="rounded-2xl border border-border p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-semibold">{money(refund.amount)} · {refundLabels[refund.status] ?? refund.status}</p><p className="text-xs text-muted-foreground">{new Date(refund.created_at).toLocaleString('pl-PL')} {Array.isArray(refund.requested_dates) && refund.requested_dates.length ? `· ${refund.requested_dates.join(', ')}` : '· cały zapis'}</p>{refund.error_message && <p className="mt-1 text-sm text-red-600">{refund.error_message}</p>}</div>{['failed', 'canceled', 'requires_action'].includes(refund.status) && <RefundRetryButton refundId={refund.id} />}</div><div className="mt-3 space-y-1 text-xs text-muted-foreground">{(refund.event_refund_attempts ?? []).sort((a, b) => a.attempt_number - b.attempt_number).map(attempt => <p key={attempt.attempt_number}>Próba {attempt.attempt_number}: {attempt.status}{attempt.stripe_refund_id ? ` · ${attempt.stripe_refund_id}` : ''}{attempt.error_message ? ` · ${attempt.error_message}` : ''}</p>)}</div></div>)}{refunds.length === 0 && <p className="text-muted-foreground">Brak zwrotów.</p>}</div></section>

    <section className="mt-6 grid gap-3 rounded-3xl border border-border bg-white p-6 text-sm sm:grid-cols-2"><p><span className="text-muted-foreground">PaymentIntent:</span><br />{payment.stripe_payment_intent_id ?? '—'}</p><p><span className="text-muted-foreground">Charge:</span><br />{payment.stripe_charge_id ?? '—'}</p><p><span className="text-muted-foreground">Konto Stripe:</span><br />{payment.stripe_account_id}</p><p><span className="text-muted-foreground">Ostatnie uzgodnienie:</span><br />{payment.last_reconciled_at ? new Date(payment.last_reconciled_at).toLocaleString('pl-PL') : 'Jeszcze nie uzgadniano'}</p>{payment.receipt_url && <a href={payment.receipt_url} target="_blank" rel="noreferrer" className="text-accent underline">Otwórz potwierdzenie Stripe</a>}</section>
  </div>
}
