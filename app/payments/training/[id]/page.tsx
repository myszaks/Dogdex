import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { getServerUser } from '@/lib/getServerUser'
import { createServerClient } from '@/lib/supabaseServer'
import { getBusinessProfileAccess } from '@/lib/businessAccess'
import TrainingCommerceRefundButton from '@/components/TrainingCommerceRefundButton'

interface Props { params: Promise<{ id: string }> }
const paymentLabels: Record<string, string> = { pending: 'Oczekuje', completed: 'Opłacona', failed: 'Nieudana', partially_refunded: 'Częściowo zwrócona', refunded: 'Zwrócona' }
const refundLabels: Record<string, string> = { pending: 'Przetwarzany', requires_action: 'Wymaga działania', succeeded: 'Zrealizowany', failed: 'Nieudany', canceled: 'Anulowany' }

export default async function TrainingCommercePaymentPage({ params }: Props) {
  const { id } = await params
  const { user, role } = await getServerUser()
  if (!user) notFound()
  const db = createServerClient()
  const { data: payment } = await db.from('training_commerce_payments').select(`
    *,
    training_commerce_refunds(id, amount, currency, reason, status, attempt_count, stripe_refund_id, error_message, created_at, updated_at),
    training_course_enrollments(status, payment_status, dogs(name), training_courses(name)),
    training_passes(status, payment_status, entries_total, entries_remaining, dogs(name), training_pass_products(name))
  `).eq('id', id).maybeSingle()
  if (!payment) notFound()
  const businessAccess = await getBusinessProfileAccess(payment.business_profile_id)
  const canView = role === 'admin' || payment.trainer_id === user.id || Boolean(businessAccess?.can('payments.view'))
  if (!canView) notFound()
  const canManageRefund = role === 'admin' || payment.trainer_id === user.id || Boolean(businessAccess?.can('refunds.manage'))
  const enrollment = first(payment.training_course_enrollments)
  const pass = first(payment.training_passes)
  const course = first(enrollment?.training_courses)
  const product = first(pass?.training_pass_products)
  const dog = first(enrollment?.dogs) ?? first(pass?.dogs)
  const refund = first(payment.training_commerce_refunds)
  const money = (amount: number) => Number(amount).toLocaleString('pl-PL', { style: 'currency', currency: payment.currency })
  const refundNeedsAttention = refund && ['failed', 'requires_action'].includes(refund.status)
  const canRefund = canManageRefund && payment.status === 'completed' && (!pass || Number(pass.entries_remaining) === Number(pass.entries_total))

  return <div className="w-full">
    <Link href="/payments" className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary"><ArrowLeft className="h-4 w-4" /> Wróć do płatności</Link>
    <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-widest text-accent">{course ? 'Kurs' : 'Karnet'}</p><h1 className="page-title">{course?.name ?? product?.name ?? 'Płatność za trening'}</h1><p className="mt-2 text-muted-foreground">{dog?.name ?? 'Pies'} · {paymentLabels[payment.status] ?? payment.status}</p></div><div className="text-right"><p className="text-2xl font-bold">{money(payment.amount)}</p><p className="text-sm text-muted-foreground">po zwrotach: {money(Number(payment.amount) - Number(payment.refunded_amount ?? 0))}</p></div></div>

    {refundNeedsAttention ? <div className="mt-6 flex items-start justify-between gap-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900"><div className="flex gap-3"><AlertTriangle className="h-5 w-5 shrink-0" /><div><p className="font-semibold">Zwrot wymaga uwagi</p><p className="text-sm">{refund.error_message ?? 'Stripe wymaga ponowienia operacji.'}</p></div></div>{canManageRefund && <TrainingCommerceRefundButton paymentId={payment.id} retry />}</div> : <div className="mt-6 flex gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800"><CheckCircle2 className="h-5 w-5" /> Transakcja nie wymaga działania</div>}

    <section className="mt-6 rounded-3xl border border-border bg-white p-6"><div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-lg font-semibold">Zakup</h2><p className="mt-2 text-sm text-muted-foreground">Status usługi: {enrollment?.status ?? pass?.status ?? '—'} · płatność: {enrollment?.payment_status ?? pass?.payment_status ?? '—'}</p>{pass && <p className="mt-1 text-sm text-muted-foreground">Pozostało wejść: {pass.entries_remaining}/{pass.entries_total}</p>}</div>{canRefund && <TrainingCommerceRefundButton paymentId={payment.id} />}</div></section>

    <section className="mt-6 rounded-3xl border border-border bg-white p-6"><h2 className="text-lg font-semibold">Zwrot</h2>{refund ? <div className="mt-4 rounded-2xl border border-border p-4"><p className="font-semibold">{money(refund.amount)} · {refundLabels[refund.status] ?? refund.status}</p><p className="mt-1 text-xs text-muted-foreground">Próba {refund.attempt_count} · {new Date(refund.created_at).toLocaleString('pl-PL')}</p>{refund.reason && <p className="mt-2 text-sm">{refund.reason}</p>}{refund.error_message && <p className="mt-2 text-sm text-red-700">{refund.error_message}</p>}{refund.stripe_refund_id && <p className="mt-2 text-xs text-muted-foreground">Stripe Refund: {refund.stripe_refund_id}</p>}</div> : <p className="mt-3 text-muted-foreground">Brak zwrotów.</p>}</section>

    <section className="mt-6 grid gap-3 rounded-3xl border border-border bg-white p-6 text-sm sm:grid-cols-2"><p><span className="text-muted-foreground">PaymentIntent:</span><br />{payment.stripe_payment_intent_id ?? '—'}</p><p><span className="text-muted-foreground">Charge:</span><br />{payment.stripe_charge_id ?? '—'}</p><p><span className="text-muted-foreground">Konto Stripe:</span><br />{payment.stripe_account_id}</p><p><span className="text-muted-foreground">Ostatnie uzgodnienie:</span><br />{payment.last_reconciled_at ? new Date(payment.last_reconciled_at).toLocaleString('pl-PL') : 'Jeszcze nie uzgadniano'}</p>{payment.receipt_url && <a href={payment.receipt_url} target="_blank" rel="noreferrer" className="text-accent underline">Otwórz potwierdzenie Stripe</a>}</section>
  </div>
}

function first<T>(value: T | T[] | null | undefined): T | undefined { return Array.isArray(value) ? value[0] : value ?? undefined }
