import Link from 'next/link'
import { CreditCard, ExternalLink } from 'lucide-react'
import { requireRole } from '@/lib/getServerUser'
import { createAuthClient } from '@/lib/supabaseServer'
import PaymentsActions from '@/components/PaymentsActions'

export const dynamic = 'force-dynamic'

function money(amount: number, currency: string) {
  return Number(amount).toLocaleString('pl-PL', { style: 'currency', currency })
}

const statusLabels: Record<string, string> = {
  pending: 'Oczekuje', completed: 'Opłacono', failed: 'Nieudana',
  partially_refunded: 'Częściowy zwrot', refunded: 'Zwrócono',
}

interface LedgerRow {
  id: string
  source: 'Trening' | 'Wydarzenie'
  description: string
  detail: string
  amount: number
  currency: string
  status: string
  createdAt: string
  hasPaymentIntent: boolean
  refundedAmount: number
  reconciliationStatus?: string
}

export default async function PaymentsPage() {
  const { user } = await requireRole(['organizer', 'trainer', 'admin'])
  const supabase = await createAuthClient()
  const { data: profile } = await supabase.from('profiles')
    .select('stripe_onboarded, stripe_account_id').eq('id', user.id).maybeSingle()
  const rows: LedgerRow[] = []

  const { data: eventPayments } = await supabase.from('event_payments')
    .select('id, amount, refunded_amount, currency, status, created_at, stripe_payment_intent_id, reconciliation_status, registrations(participants(owner_name, dog_name), events(title)), event_payment_items(event_registration_items(label))')
    .eq('payee_user_id', user.id).order('created_at', { ascending: false }).limit(200)
  for (const payment of eventPayments ?? []) {
    const registration = Array.isArray(payment.registrations) ? payment.registrations[0] : payment.registrations
    const event = Array.isArray(registration?.events) ? registration?.events[0] : registration?.events
    const participant = Array.isArray(registration?.participants) ? registration?.participants[0] : registration?.participants
    const itemLabels = (payment.event_payment_items ?? []).map(item => {
      const registrationItem = Array.isArray(item.event_registration_items)
        ? item.event_registration_items[0]
        : item.event_registration_items
      return registrationItem?.label
    }).filter(Boolean)
    rows.push({
      id: payment.id, source: 'Wydarzenie', description: event?.title ?? 'Wydarzenie',
      detail: [participant?.owner_name, participant?.dog_name, itemLabels.join(', ')].filter(Boolean).join(' · ') || 'Uczestnik',
      amount: Number(payment.amount), currency: payment.currency, status: payment.status,
      createdAt: payment.created_at, hasPaymentIntent: Boolean(payment.stripe_payment_intent_id),
      refundedAmount: Number(payment.refunded_amount ?? 0), reconciliationStatus: payment.reconciliation_status,
    })
  }

  const { data: trainingTypes } = await supabase.from('training_types').select('id, name').eq('trainer_id', user.id)
  const typeNames = new Map((trainingTypes ?? []).map(type => [type.id, type.name]))
  if (typeNames.size > 0) {
    const { data: bookings } = await supabase.from('training_bookings')
      .select('id, training_type_id, scheduled_at').in('training_type_id', [...typeNames.keys()])
    const bookingMap = new Map((bookings ?? []).map(booking => [booking.id, booking]))
    if (bookingMap.size > 0) {
      const { data: payments } = await supabase.from('training_payments')
        .select('id, booking_id, amount, currency, status, created_at, stripe_payment_intent_id')
        .in('booking_id', [...bookingMap.keys()]).order('created_at', { ascending: false }).limit(200)
      for (const payment of payments ?? []) {
        const booking = bookingMap.get(payment.booking_id)
        if (!booking) continue
        rows.push({
          id: payment.id, source: 'Trening',
          description: typeNames.get(booking.training_type_id) ?? 'Trening indywidualny',
          detail: new Intl.DateTimeFormat('pl-PL', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(booking.scheduled_at)),
          amount: Number(payment.amount), currency: payment.currency, status: payment.status,
          createdAt: payment.created_at, hasPaymentIntent: Boolean(payment.stripe_payment_intent_id),
          refundedAmount: payment.status === 'refunded' ? Number(payment.amount) : 0,
        })
      }
    }
  }
  rows.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  const gross = rows.filter(row => row.status !== 'failed' && row.status !== 'pending').reduce((sum, row) => sum + row.amount, 0)
  const refunded = rows.reduce((sum, row) => sum + row.refundedAmount, 0)
  const attention = rows.filter(row => row.reconciliationStatus === 'attention' || row.reconciliationStatus === 'error').length

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div><h1 className="page-title">Płatności</h1><p className="mt-2 text-muted-foreground">Treningi i wydarzenia na jednym koncie Stripe.</p></div>
        <div className="space-y-2"><PaymentsActions />{profile?.stripe_onboarded ? (
          <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700"><CreditCard className="h-4 w-4" /> Stripe połączony</span>
        ) : (
          <Link href="/api/stripe/connect" className="btn btn-primary">Połącz konto Stripe <ExternalLink className="h-4 w-4" /></Link>
        )}</div>
      </div>
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><div className="card p-5"><p className="text-sm text-muted-foreground">Sprzedaż brutto</p><p className="mt-1 text-2xl font-bold">{money(gross, 'PLN')}</p></div><div className="card p-5"><p className="text-sm text-muted-foreground">Zwroty</p><p className="mt-1 text-2xl font-bold text-red-600">{money(refunded, 'PLN')}</p></div><div className="card p-5"><p className="text-sm text-muted-foreground">Przychód netto</p><p className="mt-1 text-2xl font-bold text-emerald-700">{money(gross - refunded, 'PLN')}</p></div><div className="card p-5"><p className="text-sm text-muted-foreground">Wymagają uwagi</p><p className="mt-1 text-2xl font-bold text-amber-700">{attention}</p></div></div>
      <div className="overflow-hidden rounded-3xl border border-border bg-white shadow-sm"><div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-secondary text-left text-muted-foreground"><tr><th className="p-4">Data</th><th className="p-4">Za co</th><th className="p-4">Opis</th><th className="p-4">Kwota</th><th className="p-4">Status</th><th className="p-4">Stripe</th></tr></thead>
          <tbody>
            {rows.map(row => <tr key={`${row.source}-${row.id}`} className="border-t border-border">
              <td className="p-4 whitespace-nowrap">{new Intl.DateTimeFormat('pl-PL', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(row.createdAt))}</td>
              <td className="p-4"><span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold">{row.source}</span></td>
              <td className="p-4"><p className="font-semibold">{row.source === 'Wydarzenie' ? <Link href={`/payments/events/${row.id}`} className="hover:text-accent hover:underline">{row.description}</Link> : row.description}</p><p className="text-xs text-muted-foreground">{row.detail}</p>{row.refundedAmount > 0 && <p className="text-xs text-red-600">Zwrócono: {money(row.refundedAmount, row.currency)}</p>}</td>
              <td className="p-4 font-semibold whitespace-nowrap">{money(row.amount, row.currency)}</td>
              <td className="p-4">{statusLabels[row.status] ?? row.status}</td><td className="p-4">{row.hasPaymentIntent ? 'PaymentIntent zapisany' : '—'}</td>
            </tr>)}
            {rows.length === 0 && <tr><td colSpan={6} className="p-12 text-center text-muted-foreground">Brak płatności do wyświetlenia.</td></tr>}
          </tbody>
        </table>
      </div></div>
    </div>
  )
}
